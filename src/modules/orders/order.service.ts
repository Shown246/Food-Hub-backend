import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../../lib/prisma.js";
import { ConflictError, NotFoundError, ValidationError } from "../../common/errors/app-error.js";
import { paginationMeta, parsePagination } from "../../common/pagination/pagination.js";
import { orderSummarySelect, providerOrderSummarySelect, safeOrderSelect } from "../../common/serialization/selectors.js";
import { serializeOrder, serializeOrderSummary, serializeProviderOrderSummary } from "../../common/serialization/serializers.js";
import type {
  CancelOrderInput,
  CreateOrderInput,
  OrderListQuery,
  ProviderOrderListQuery,
  ProviderOrderStatusInput,
} from "./order.schema.js";

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1_000;
const MAX_QUANTITY_PER_MEAL = 20;

interface ConsolidatedItem {
  mealId: string;
  quantity: number;
  note?: string;
}

export interface OrderServiceDependencies {
  database: typeof prisma;
  schemaName?: string;
  now?: () => Date;
  generateOrderNumber?: (now: Date) => string;
}

export const defaultOrderNumber = (now: Date): string => {
  const date = now.toISOString().slice(0, 10).replaceAll("-", "");
  return `FH-${date}-${randomBytes(6).toString("hex").toUpperCase()}`;
};

export const consolidateOrderItems = (items: CreateOrderInput["items"]): ConsolidatedItem[] => {
  const consolidated = new Map<string, ConsolidatedItem>();
  for (const item of items) {
    const existing = consolidated.get(item.mealId);
    if (!existing) {
      consolidated.set(item.mealId, { mealId: item.mealId, quantity: item.quantity, ...(item.note ? { note: item.note } : {}) });
      continue;
    }
    if ((existing.note ?? null) !== (item.note ?? null)) {
      throw new ValidationError({ items: `Duplicate meal ${item.mealId} has conflicting notes.` });
    }
    existing.quantity += item.quantity;
    if (existing.quantity > MAX_QUANTITY_PER_MEAL) {
      throw new ValidationError({ items: `Combined quantity for meal ${item.mealId} cannot exceed ${MAX_QUANTITY_PER_MEAL}.` });
    }
  }
  return [...consolidated.values()].sort((left, right) => left.mealId.localeCompare(right.mealId));
};

const requestHash = (input: CreateOrderInput, items: ConsolidatedItem[]): string => createHash("sha256")
  .update(JSON.stringify({
    items,
    customerPhone: input.customerPhone,
    deliveryAddress: input.deliveryAddress,
    deliveryInstructions: input.deliveryInstructions ?? null,
  }))
  .digest("hex");

const isUniqueConflict = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "code" in error && error.code === "P2002";

const validateSchemaName = (schemaName: string): void => {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schemaName)) throw new Error("Invalid internal database schema name");
};

const providerNextStatus = {
  PLACED: "PREPARING",
  PREPARING: "READY",
  READY: "DELIVERED",
} as const;

export const isProviderTransitionAllowed = (
  current: "PLACED" | "PREPARING" | "READY" | "DELIVERED" | "CANCELLED",
  next: ProviderOrderStatusInput["status"],
): boolean => current in providerNextStatus
  && providerNextStatus[current as keyof typeof providerNextStatus] === next;

const providerDateWhere = (query: ProviderOrderListQuery): Prisma.DateTimeFilter | undefined => {
  if (!query.dateFrom && !query.dateTo) return undefined;
  const from = query.dateFrom ? new Date(query.dateFrom) : undefined;
  if (!query.dateTo) return { ...(from ? { gte: from } : {}) };
  if (/^\d{4}-\d{2}-\d{2}$/.test(query.dateTo)) {
    const exclusiveEnd = new Date(query.dateTo);
    exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1);
    return { ...(from ? { gte: from } : {}), lt: exclusiveEnd };
  }
  return { ...(from ? { gte: from } : {}), lte: new Date(query.dateTo) };
};

export const createOrderService = ({
  database,
  schemaName = "public",
  now = () => new Date(),
  generateOrderNumber = defaultOrderNumber,
}: OrderServiceDependencies = { database: prisma }) => ({
  async create(customerId: string, input: CreateOrderInput, idempotencyKey?: string) {
    validateSchemaName(schemaName);
    const items = consolidateOrderItems(input.items);
    const hash = requestHash(input, items);
    const currentTime = now();

    const loadReplay = async () => {
      if (!idempotencyKey) return null;
      const stored = await database.orderIdempotencyKey.findUnique({
        where: { customerId_idempotencyKey: { customerId, idempotencyKey } },
        select: { requestHash: true, expiresAt: true, order: { select: safeOrderSelect } },
      });
      if (!stored || stored.expiresAt <= currentTime) return null;
      if (stored.requestHash !== hash) {
        throw new ConflictError("The idempotency key was already used with a different request.", "IDEMPOTENCY_KEY_REUSED");
      }
      return { order: serializeOrder(stored.order), replayed: true };
    };

    const replay = await loadReplay();
    if (replay) return replay;

    try {
      const order = await database.$transaction(async (transaction) => {
        if (idempotencyKey) {
          const existing = await transaction.orderIdempotencyKey.findUnique({
            where: { customerId_idempotencyKey: { customerId, idempotencyKey } },
            select: { id: true, requestHash: true, expiresAt: true, order: { select: safeOrderSelect } },
          });
          if (existing && existing.expiresAt > currentTime) {
            if (existing.requestHash !== hash) {
              throw new ConflictError("The idempotency key was already used with a different request.", "IDEMPOTENCY_KEY_REUSED");
            }
            return { record: existing.order, replayed: true };
          }
          if (existing) await transaction.orderIdempotencyKey.delete({ where: { id: existing.id } });
        }

        const schema = Prisma.raw(`"${schemaName}"`);
        const mealIds = items.map(({ mealId }) => mealId);
        await transaction.$queryRaw(Prisma.sql`
          SELECT m."id"
          FROM ${schema}."meal" m
          JOIN ${schema}."category" c ON c."id" = m."categoryId"
          JOIN ${schema}."provider_profile" p ON p."id" = m."providerId"
          JOIN ${schema}."user" u ON u."id" = p."userId"
          WHERE m."id" IN (${Prisma.join(mealIds)})
          FOR SHARE OF m, c, p, u
        `);

        const customer = await transaction.user.findFirst({
          where: { id: customerId, role: "CUSTOMER", status: "ACTIVE" },
          select: { id: true, fullName: true },
        });
        const meals = await transaction.meal.findMany({
          where: { id: { in: mealIds } },
          select: {
            id: true,
            name: true,
            price: true,
            providerId: true,
            isAvailable: true,
            isArchived: true,
            category: { select: { isActive: true } },
            provider: { select: { acceptingOrders: true, user: { select: { status: true } } } },
          },
        });
        if (!customer) throw new ConflictError("The customer account cannot place orders.", "CUSTOMER_NOT_ACTIVE");
        if (meals.length !== mealIds.length) throw new NotFoundError("One or more meals were not found.", "MEAL_NOT_FOUND");

        const providerIds = new Set(meals.map(({ providerId }) => providerId));
        if (providerIds.size !== 1) {
          throw new ValidationError({ items: "All meals in an order must belong to the same provider." });
        }
        for (const meal of meals) {
          if (meal.isArchived || !meal.isAvailable) {
            throw new ConflictError("One or more meals are unavailable.", "MEAL_NOT_ORDERABLE");
          }
          if (!meal.category.isActive) {
            throw new ConflictError("One or more meal categories are inactive.", "CATEGORY_NOT_ACTIVE");
          }
          if (meal.provider.user.status !== "ACTIVE") {
            throw new ConflictError("The provider is not active.", "PROVIDER_NOT_ACTIVE");
          }
          if (!meal.provider.acceptingOrders) {
            throw new ConflictError("The provider is not accepting orders.", "PROVIDER_NOT_ACCEPTING_ORDERS");
          }
        }

        const mealsById = new Map(meals.map((meal) => [meal.id, meal]));
        const orderItems = items.map((item) => {
          const meal = mealsById.get(item.mealId)!;
          return {
            mealId: meal.id,
            mealName: meal.name,
            unitPrice: meal.price,
            quantity: item.quantity,
            itemNote: item.note,
            lineTotal: meal.price.mul(item.quantity),
          };
        });
        const subtotal = orderItems.reduce((total, item) => total.add(item.lineTotal), new Prisma.Decimal(0));
        const orderNumber = generateOrderNumber(currentTime);
        const record = await transaction.order.create({
          data: {
            orderNumber,
            customerId,
            providerId: meals[0]!.providerId,
            customerName: customer.fullName,
            customerPhone: input.customerPhone,
            deliveryAddress: input.deliveryAddress,
            deliveryInstructions: input.deliveryInstructions,
            subtotal,
            total: subtotal,
            items: { create: orderItems },
            statusHistory: {
              create: { fromStatus: null, toStatus: "PLACED", actorUserId: customerId, actorRole: "CUSTOMER" },
            },
            ...(idempotencyKey ? {
              idempotency: {
                create: {
                  customerId,
                  idempotencyKey,
                  requestHash: hash,
                  expiresAt: new Date(currentTime.getTime() + IDEMPOTENCY_TTL_MS),
                },
              },
            } : {}),
          },
          select: safeOrderSelect,
        });
        return { record, replayed: false };
      });
      return { order: serializeOrder(order.record), replayed: order.replayed };
    } catch (error) {
      if (idempotencyKey && isUniqueConflict(error)) {
        const concurrentReplay = await loadReplay();
        if (concurrentReplay) return concurrentReplay;
      }
      throw error;
    }
  },

  async listOwn(customerId: string, query: OrderListQuery) {
    const pagination = parsePagination(query);
    const where = { customerId, ...(query.status ? { status: query.status } : {}) };
    const orderBy: Prisma.OrderOrderByWithRelationInput[] = query.sort === "oldest"
      ? [{ createdAt: "asc" }, { id: "asc" }]
      : query.sort === "total_desc"
        ? [{ total: "desc" }, { createdAt: "desc" }, { id: "asc" }]
        : [{ createdAt: "desc" }, { id: "asc" }];
    const [totalItems, orders] = await Promise.all([
      database.order.count({ where }),
      database.order.findMany({
        where,
        orderBy,
        skip: pagination.skip,
        take: pagination.take,
        select: orderSummarySelect,
      }),
    ]);
    return {
      orders: orders.map(serializeOrderSummary),
      meta: paginationMeta(pagination.page, pagination.limit, totalItems),
    };
  },

  async getOwn(customerId: string, orderId: string) {
    const order = await database.order.findFirst({
      where: { id: orderId, customerId },
      select: safeOrderSelect,
    });
    if (!order) throw new NotFoundError("The order was not found.", "ORDER_NOT_FOUND");
    return serializeOrder(order);
  },

  async cancelOwn(
    customerId: string,
    orderId: string,
    input: CancelOrderInput,
    requestId?: string,
  ) {
    const cancelledAt = now();
    const order = await database.$transaction(async (transaction) => {
      const owned = await transaction.order.findFirst({
        where: { id: orderId, customerId },
        select: { id: true, status: true },
      });
      if (!owned) throw new NotFoundError("The order was not found.", "ORDER_NOT_FOUND");
      if (owned.status !== "PLACED") {
        throw new ConflictError("Only a placed order can be cancelled.", "ORDER_CANNOT_BE_CANCELLED");
      }

      const updated = await transaction.order.updateMany({
        where: { id: orderId, customerId, status: "PLACED" },
        data: {
          status: "CANCELLED",
          cancellationReason: input.reason ?? null,
          cancelledAt,
        },
      });
      if (updated.count === 0) {
        throw new ConflictError("The order changed before it could be cancelled.", "ORDER_STATUS_CONFLICT");
      }
      await transaction.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: "PLACED",
          toStatus: "CANCELLED",
          actorUserId: customerId,
          actorRole: "CUSTOMER",
          note: input.reason ?? null,
        },
      });
      await transaction.auditEvent.create({
        data: {
          actorType: "USER",
          actorUserId: customerId,
          actorRole: "CUSTOMER",
          action: "ORDER_STATUS_CHANGED",
          entityType: "ORDER",
          entityId: orderId,
          requestId,
          metadata: { fromStatus: "PLACED", toStatus: "CANCELLED", reason: input.reason ?? null },
        },
      });
      return transaction.order.findFirstOrThrow({
        where: { id: orderId, customerId },
        select: safeOrderSelect,
      });
    });
    return serializeOrder(order);
  },

  async listProvider(providerId: string, query: ProviderOrderListQuery) {
    const pagination = parsePagination(query);
    const createdAt = providerDateWhere(query);
    const where: Prisma.OrderWhereInput = {
      providerId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search ? {
        OR: [
          { orderNumber: { contains: query.search, mode: "insensitive" } },
          { customerName: { contains: query.search, mode: "insensitive" } },
        ],
      } : {}),
      ...(createdAt ? { createdAt } : {}),
    };
    const [totalItems, orders] = await Promise.all([
      database.order.count({ where }),
      database.order.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip: pagination.skip,
        take: pagination.take,
        select: providerOrderSummarySelect,
      }),
    ]);
    return {
      orders: orders.map(serializeProviderOrderSummary),
      meta: paginationMeta(pagination.page, pagination.limit, totalItems),
    };
  },

  async getProvider(providerId: string, orderId: string) {
    const order = await database.order.findFirst({
      where: { id: orderId, providerId },
      select: safeOrderSelect,
    });
    if (!order) throw new NotFoundError("The order was not found.", "ORDER_NOT_FOUND");
    return serializeOrder(order);
  },

  async updateProviderStatus(
    providerId: string,
    actorUserId: string,
    orderId: string,
    input: ProviderOrderStatusInput,
    requestId?: string,
  ) {
    const changedAt = now();
    const order = await database.$transaction(async (transaction) => {
      const owned = await transaction.order.findFirst({
        where: { id: orderId, providerId },
        select: { status: true },
      });
      if (!owned) throw new NotFoundError("The order was not found.", "ORDER_NOT_FOUND");
      if (!isProviderTransitionAllowed(owned.status, input.status)) {
        throw new ConflictError("The requested order status transition is not allowed.", "INVALID_ORDER_TRANSITION");
      }

      const updated = await transaction.order.updateMany({
        where: { id: orderId, providerId, status: owned.status },
        data: {
          status: input.status,
          ...(input.status === "DELIVERED" ? { deliveredAt: changedAt } : {}),
        },
      });
      if (updated.count === 0) {
        throw new ConflictError("The order status changed before this request completed.", "ORDER_STATUS_CONFLICT");
      }
      await transaction.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: owned.status,
          toStatus: input.status,
          actorUserId,
          actorRole: "PROVIDER",
        },
      });
      await transaction.auditEvent.create({
        data: {
          actorType: "USER",
          actorUserId,
          actorRole: "PROVIDER",
          action: "ORDER_STATUS_CHANGED",
          entityType: "ORDER",
          entityId: orderId,
          requestId,
          metadata: { providerId, fromStatus: owned.status, toStatus: input.status },
        },
      });
      return transaction.order.findFirstOrThrow({
        where: { id: orderId, providerId },
        select: safeOrderSelect,
      });
    });
    return serializeOrder(order);
  },
});

export const orderService = createOrderService();
export type OrderService = ReturnType<typeof createOrderService>;
