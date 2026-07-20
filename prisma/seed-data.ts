import { hashPassword } from "better-auth/crypto";
import type { PrismaClient, Role } from "../generated/prisma/client.js";
import { password as passwordSchema } from "../src/modules/auth/auth.schema.js";
import { normalizedEmail, safeText } from "../src/common/validation/schemas.js";

export const STANDARD_CATEGORIES = [
  { name: "Bangladeshi", slug: "bangladeshi", displayOrder: 10 },
  { name: "Indian", slug: "indian", displayOrder: 20 },
  { name: "Chinese", slug: "chinese", displayOrder: 30 },
  { name: "Pizza", slug: "pizza", displayOrder: 40 },
  { name: "Burgers", slug: "burgers", displayOrder: 50 },
  { name: "Breakfast", slug: "breakfast", displayOrder: 60 },
  { name: "Desserts", slug: "desserts", displayOrder: 70 },
  { name: "Beverages", slug: "beverages", displayOrder: 80 },
] as const;

export interface SeedOptions {
  adminName: string;
  adminEmail: string;
  adminPassword: string;
  includeDevelopmentData: boolean;
  developmentPassword?: string;
}

export interface SeedResult {
  adminId: string;
  categoryCount: number;
  developmentDataSeeded: boolean;
}

export class SeedConfigurationError extends Error {
  constructor(message: string) {
    super(`Invalid seed configuration: ${message}`);
    this.name = "SeedConfigurationError";
  }
}

const required = (env: NodeJS.ProcessEnv, name: string): string => {
  const value = env[name]?.trim();
  if (!value) throw new SeedConfigurationError(`${name} is required`);
  return value;
};

const parseWith = <T>(name: string, value: string, schema: { safeParse(input: unknown): { success: true; data: T } | { success: false; error: { issues: Array<{ message: string }> } } }): T => {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new SeedConfigurationError(`${name}: ${parsed.error.issues[0]?.message ?? "is invalid"}`);
  return parsed.data;
};

export const seedOptionsFromEnvironment = (
  env: NodeJS.ProcessEnv,
  forceDevelopmentData = false,
): SeedOptions => {
  const flag = env.SEED_DEVELOPMENT_DATA?.trim();
  if (flag && flag !== "true" && flag !== "false") {
    throw new SeedConfigurationError("SEED_DEVELOPMENT_DATA must be either true or false");
  }
  const includeDevelopmentData = forceDevelopmentData || flag === "true";
  if (includeDevelopmentData && env.NODE_ENV === "production") {
    throw new SeedConfigurationError("development fixtures cannot be seeded when NODE_ENV=production");
  }
  const developmentPassword = includeDevelopmentData
    ? parseWith("SEED_DEVELOPMENT_PASSWORD", required(env, "SEED_DEVELOPMENT_PASSWORD"), passwordSchema)
    : undefined;
  return {
    adminName: parseWith("SEED_ADMIN_NAME", required(env, "SEED_ADMIN_NAME"), safeText(100)),
    adminEmail: parseWith("SEED_ADMIN_EMAIL", required(env, "SEED_ADMIN_EMAIL"), normalizedEmail),
    adminPassword: parseWith("SEED_ADMIN_PASSWORD", required(env, "SEED_ADMIN_PASSWORD"), passwordSchema),
    includeDevelopmentData,
    ...(developmentPassword ? { developmentPassword } : {}),
  };
};

const ensureCredentialUser = async (
  database: PrismaClient,
  input: { fullName: string; email: string; password: string; role: Role },
) => {
  const existing = await database.user.findUnique({ where: { email: input.email }, select: { id: true, role: true } });
  if (existing && existing.role !== input.role) {
    throw new SeedConfigurationError(`${input.email} already belongs to a ${existing.role} account`);
  }
  const passwordHash = await hashPassword(input.password);
  const user = existing
    ? await database.user.update({ where: { id: existing.id }, data: { fullName: input.fullName }, select: { id: true } })
    : await database.user.create({
      data: { fullName: input.fullName, email: input.email, role: input.role },
      select: { id: true },
    });
  await database.account.upsert({
    where: { providerId_accountId: { providerId: "credential", accountId: user.id } },
    update: { userId: user.id, password: passwordHash },
    create: { providerId: "credential", accountId: user.id, userId: user.id, password: passwordHash },
  });
  return user;
};

const seedDevelopmentFixtures = async (database: PrismaClient, fixturePassword: string): Promise<void> => {
  const customer = await ensureCredentialUser(database, {
    fullName: "Development Customer",
    email: "dev.customer@foodhub.local",
    password: fixturePassword,
    role: "CUSTOMER",
  });
  const providerUser = await ensureCredentialUser(database, {
    fullName: "Development Provider Owner",
    email: "dev.provider@foodhub.local",
    password: fixturePassword,
    role: "PROVIDER",
  });
  const provider = await database.providerProfile.upsert({
    where: { userId: providerUser.id },
    update: {
      name: "FoodHub Development Kitchen",
      description: "Optional local development provider fixture.",
      address: "Dhaka, Bangladesh",
      phone: "+8801800000000",
      acceptingOrders: true,
    },
    create: {
      userId: providerUser.id,
      name: "FoodHub Development Kitchen",
      description: "Optional local development provider fixture.",
      address: "Dhaka, Bangladesh",
      phone: "+8801800000000",
    },
    select: { id: true },
  });
  const [bangladeshi, beverages] = await Promise.all([
    database.category.findUniqueOrThrow({ where: { slug: "bangladeshi" }, select: { id: true } }),
    database.category.findUniqueOrThrow({ where: { slug: "beverages" }, select: { id: true } }),
  ]);
  const meal = await database.meal.upsert({
    where: { providerId_slug: { providerId: provider.id, slug: "development-kacchi-biryani" } },
    update: { categoryId: bangladeshi.id, name: "Development Kacchi Biryani", description: "A local development meal fixture.", price: "320.00", isAvailable: true, isArchived: false },
    create: { providerId: provider.id, categoryId: bangladeshi.id, slug: "development-kacchi-biryani", name: "Development Kacchi Biryani", description: "A local development meal fixture.", price: "320.00" },
    select: { id: true },
  });
  await database.meal.upsert({
    where: { providerId_slug: { providerId: provider.id, slug: "development-borhani" } },
    update: { categoryId: beverages.id, name: "Development Borhani", description: "A local development beverage fixture.", price: "60.00", isAvailable: true, isArchived: false },
    create: { providerId: provider.id, categoryId: beverages.id, slug: "development-borhani", name: "Development Borhani", description: "A local development beverage fixture.", price: "60.00" },
  });

  const orderInputs = [
    { id: "seed-development-order-placed", orderNumber: "FH-DEV-PLACED", status: "PLACED" as const, total: "320.00", createdAt: new Date("2026-01-01T10:00:00.000Z") },
    { id: "seed-development-order-delivered", orderNumber: "FH-DEV-DELIVERED", status: "DELIVERED" as const, total: "640.00", createdAt: new Date("2026-01-02T10:00:00.000Z") },
  ];
  for (const order of orderInputs) {
    await database.order.upsert({
      where: { orderNumber: order.orderNumber },
      update: {},
      create: {
        id: order.id,
        orderNumber: order.orderNumber,
        customerId: customer.id,
        providerId: provider.id,
        status: order.status,
        customerName: "Development Customer",
        customerPhone: "+8801700000000",
        deliveryAddress: "Dhaka, Bangladesh",
        subtotal: order.total,
        total: order.total,
        createdAt: order.createdAt,
        ...(order.status === "DELIVERED" ? { deliveredAt: order.createdAt } : {}),
        items: { create: { mealId: meal.id, mealName: "Development Kacchi Biryani", unitPrice: "320.00", quantity: order.status === "DELIVERED" ? 2 : 1, lineTotal: order.total } },
        statusHistory: { create: order.status === "PLACED"
          ? { toStatus: "PLACED", actorUserId: customer.id, actorRole: "CUSTOMER", createdAt: order.createdAt }
          : [
            { toStatus: "PLACED", actorUserId: customer.id, actorRole: "CUSTOMER", createdAt: order.createdAt },
            { fromStatus: "PLACED", toStatus: "PREPARING", actorUserId: providerUser.id, actorRole: "PROVIDER", createdAt: new Date(order.createdAt.getTime() + 60_000) },
            { fromStatus: "PREPARING", toStatus: "READY", actorUserId: providerUser.id, actorRole: "PROVIDER", createdAt: new Date(order.createdAt.getTime() + 120_000) },
            { fromStatus: "READY", toStatus: "DELIVERED", actorUserId: providerUser.id, actorRole: "PROVIDER", createdAt: new Date(order.createdAt.getTime() + 180_000) },
          ] },
      },
    });
  }
};

export const seedDatabase = async (database: PrismaClient, options: SeedOptions): Promise<SeedResult> => {
  for (const category of STANDARD_CATEGORIES) {
    await database.category.upsert({
      where: { name: category.name },
      update: { slug: category.slug, displayOrder: category.displayOrder, isActive: true },
      create: category,
    });
  }
  const admin = await ensureCredentialUser(database, {
    fullName: options.adminName,
    email: options.adminEmail,
    password: options.adminPassword,
    role: "ADMIN",
  });
  if (options.includeDevelopmentData) {
    await seedDevelopmentFixtures(database, options.developmentPassword!);
  }
  return {
    adminId: admin.id,
    categoryCount: STANDARD_CATEGORIES.length,
    developmentDataSeeded: options.includeDevelopmentData,
  };
};
