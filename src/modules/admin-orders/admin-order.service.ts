import type { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../../lib/prisma.js";
import { NotFoundError } from "../../common/errors/app-error.js";
import { paginationMeta, parsePagination } from "../../common/pagination/pagination.js";
import { publicProviderSelect, publicUserSelect, safeOrderSelect } from "../../common/serialization/selectors.js";
import {
  serializeOrder,
  serializeOrderSummary,
  serializePublicUser,
} from "../../common/serialization/serializers.js";
import type { AdminOrderListQuery } from "./admin-order.schema.js";

export interface AdminOrderServiceDependencies {
  database: typeof prisma;
}

const adminOrderSummarySelect = {
  id: true,
  orderNumber: true,
  status: true,
  paymentMethod: true,
  subtotal: true,
  deliveryFee: true,
  tax: true,
  serviceFee: true,
  total: true,
  cancelledAt: true,
  deliveredAt: true,
  createdAt: true,
  updatedAt: true,
  customer: { select: publicUserSelect },
  provider: { select: publicProviderSelect },
  _count: { select: { items: true } },
} satisfies Prisma.OrderSelect;

const adminOrderDetailSelect = {
  ...safeOrderSelect,
  customer: { select: publicUserSelect },
  statusHistory: {
    select: {
      id: true,
      fromStatus: true,
      toStatus: true,
      actorRole: true,
      note: true,
      createdAt: true,
      actorUser: { select: publicUserSelect },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  },
} satisfies Prisma.OrderSelect;

const createdAtWhere = (query: AdminOrderListQuery): Prisma.DateTimeFilter | undefined => {
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

export const adminOrderWhere = (query: AdminOrderListQuery): Prisma.OrderWhereInput => {
  const createdAt = createdAtWhere(query);
  return {
    ...(query.status ? { status: query.status } : {}),
    ...(query.customerId ? { customerId: query.customerId } : {}),
    ...(query.providerId ? { providerId: query.providerId } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(query.search ? {
      OR: [
        { orderNumber: { contains: query.search, mode: "insensitive" } },
        { customerName: { contains: query.search, mode: "insensitive" } },
        { provider: { is: { name: { contains: query.search, mode: "insensitive" } } } },
      ],
    } : {}),
  };
};

export const createAdminOrderService = (
  { database }: AdminOrderServiceDependencies = { database: prisma },
) => ({
  async list(query: AdminOrderListQuery) {
    const pagination = parsePagination(query);
    const where = adminOrderWhere(query);
    const [totalItems, orders] = await Promise.all([
      database.order.count({ where }),
      database.order.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip: pagination.skip,
        take: pagination.take,
        select: adminOrderSummarySelect,
      }),
    ]);
    return {
      orders: orders.map((order) => ({
        ...serializeOrderSummary(order),
        customer: serializePublicUser(order.customer),
      })),
      meta: paginationMeta(pagination.page, pagination.limit, totalItems),
    };
  },

  async get(orderId: string) {
    const order = await database.order.findUnique({
      where: { id: orderId },
      select: adminOrderDetailSelect,
    });
    if (!order) throw new NotFoundError("The order was not found.", "ORDER_NOT_FOUND");
    return {
      ...serializeOrder(order),
      customer: serializePublicUser(order.customer),
      statusHistory: order.statusHistory.map((history) => ({
        id: history.id,
        fromStatus: history.fromStatus,
        toStatus: history.toStatus,
        actorRole: history.actorRole,
        note: history.note,
        createdAt: history.createdAt.toISOString(),
        actor: serializePublicUser(history.actorUser),
      })),
    };
  },
});

export const adminOrderService = createAdminOrderService();
export type AdminOrderService = ReturnType<typeof createAdminOrderService>;
