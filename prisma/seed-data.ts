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

export const seedRichDevelopmentFixtures = async (database: PrismaClient, fixturePassword: string): Promise<void> => {
  // 1. Ensure Extra Customers
  const customer1 = await ensureCredentialUser(database, {
    fullName: "Sarah Ahmed",
    email: "dev.customer1@foodhub.local",
    password: fixturePassword,
    role: "CUSTOMER",
  });
  const customer2 = await ensureCredentialUser(database, {
    fullName: "Tanvir Hasan",
    email: "dev.customer2@foodhub.local",
    password: fixturePassword,
    role: "CUSTOMER",
  });
  const customer3 = await ensureCredentialUser(database, {
    fullName: "Nusrat Jahan",
    email: "dev.customer3@foodhub.local",
    password: fixturePassword,
    role: "CUSTOMER",
  });

  // 2. Ensure Extra Provider Users & Profiles
  const providerUser1 = await ensureCredentialUser(database, {
    fullName: "Rahim Uddin",
    email: "dev.provider1@foodhub.local",
    password: fixturePassword,
    role: "PROVIDER",
  });
  const providerUser2 = await ensureCredentialUser(database, {
    fullName: "Chen Wei",
    email: "dev.provider2@foodhub.local",
    password: fixturePassword,
    role: "PROVIDER",
  });
  const providerUser3 = await ensureCredentialUser(database, {
    fullName: "Mario Rossi",
    email: "dev.provider3@foodhub.local",
    password: fixturePassword,
    role: "PROVIDER",
  });
  const providerUser4 = await ensureCredentialUser(database, {
    fullName: "Karim Hossain",
    email: "dev.provider4@foodhub.local",
    password: fixturePassword,
    role: "PROVIDER",
  });

  const provider1 = await database.providerProfile.upsert({
    where: { userId: providerUser1.id },
    update: { name: "Dhaka Spice Kitchen", description: "Authentic Bangladeshi biryani and flavorful Indian curries.", address: "House 45, Road 27, Dhanmondi, Dhaka", phone: "+8801811111111", acceptingOrders: true },
    create: { userId: providerUser1.id, name: "Dhaka Spice Kitchen", description: "Authentic Bangladeshi biryani and flavorful Indian curries.", address: "House 45, Road 27, Dhanmondi, Dhaka", phone: "+8801811111111", acceptingOrders: true },
    select: { id: true },
  });

  const provider2 = await database.providerProfile.upsert({
    where: { userId: providerUser2.id },
    update: { name: "Dragon Wok Express", description: "Pan-Asian street food, fried rice, and sizzling noodles.", address: "Shop 12, Banani 11, Dhaka", phone: "+8801822222222", acceptingOrders: true },
    create: { userId: providerUser2.id, name: "Dragon Wok Express", description: "Pan-Asian street food, fried rice, and sizzling noodles.", address: "Shop 12, Banani 11, Dhaka", phone: "+8801822222222", acceptingOrders: true },
    select: { id: true },
  });

  const provider3 = await database.providerProfile.upsert({
    where: { userId: providerUser3.id },
    update: { name: "Napoli Pizza & Pasta", description: "Wood-fired artisanal pizzas and rich creamy pastas.", address: "Level 2, Pink City, Gulshan 1, Dhaka", phone: "+8801833333333", acceptingOrders: true },
    create: { userId: providerUser3.id, name: "Napoli Pizza & Pasta", description: "Wood-fired artisanal pizzas and rich creamy pastas.", address: "Level 2, Pink City, Gulshan 1, Dhaka", phone: "+8801833333333", acceptingOrders: true },
    select: { id: true },
  });

  const provider4 = await database.providerProfile.upsert({
    where: { userId: providerUser4.id },
    update: { name: "Sweet Tooth Bakery", description: "Freshly baked pastries, warm breakfast, and gourmet desserts.", address: "Plot 8, Main Road, Mirpur 10, Dhaka", phone: "+8801844444444", acceptingOrders: true },
    create: { userId: providerUser4.id, name: "Sweet Tooth Bakery", description: "Freshly baked pastries, warm breakfast, and gourmet desserts.", address: "Plot 8, Main Road, Mirpur 10, Dhaka", phone: "+8801844444444", acceptingOrders: true },
    select: { id: true },
  });

  // 3. Category mapping
  const categories = await database.category.findMany({ select: { id: true, slug: true } });
  const catMap = new Map(categories.map((c) => [c.slug, c.id]));

  // 4. Upsert Meals
  const mealData = [
    // Provider 1: Dhaka Spice Kitchen
    { providerId: provider1.id, slug: "kacchi-biryani-special", name: "Kacchi Biryani Special", description: "Rich mutton biryani cooked with fragrant basmati rice and spices.", price: "350.00", categorySlug: "bangladeshi", dietaryLabels: ["halal"], prepTime: 25 },
    { providerId: provider1.id, slug: "bhuna-khichuri-beef", name: "Bhuna Khichuri & Beef", description: "Roasted lentil rice served with spicy slow-cooked beef bhuna.", price: "280.00", categorySlug: "bangladeshi", dietaryLabels: ["halal", "spicy"], prepTime: 20 },
    { providerId: provider1.id, slug: "chicken-butter-masala", name: "Chicken Butter Masala", description: "Tender chicken tikka simmered in a velvety tomato butter gravy.", price: "320.00", categorySlug: "indian", dietaryLabels: ["halal"], prepTime: 20 },
    { providerId: provider1.id, slug: "garlic-naan", name: "Garlic Naan", description: "Oven-baked flatbread brushed with garlic butter and herbs.", price: "50.00", categorySlug: "indian", dietaryLabels: ["halal", "vegetarian"], prepTime: 10 },
    { providerId: provider1.id, slug: "special-borhani", name: "Special Borhani", description: "Traditional spiced yogurt drink with mint and mustard seeds.", price: "60.00", categorySlug: "beverages", dietaryLabels: ["halal", "vegetarian"], prepTime: 5 },

    // Provider 2: Dragon Wok Express
    { providerId: provider2.id, slug: "chicken-fried-rice", name: "Chicken Fried Rice", description: "Wok-tossed jasmine rice with shredded chicken and veggies.", price: "260.00", categorySlug: "chinese", dietaryLabels: ["halal"], prepTime: 15 },
    { providerId: provider2.id, slug: "chilli-chicken-dry", name: "Chilli Chicken Dry", description: "Crispy fried chicken tossed in soy-capsicum garlic glaze.", price: "300.00", categorySlug: "chinese", dietaryLabels: ["halal", "spicy"], prepTime: 20 },
    { providerId: provider2.id, slug: "szechuan-beef-noodles", name: "Szechuan Beef Noodles", description: "Egg noodles tossed with sliced beef in spicy Szechuan sauce.", price: "340.00", categorySlug: "chinese", dietaryLabels: ["halal", "spicy"], prepTime: 20 },
    { providerId: provider2.id, slug: "spring-rolls", name: "Spring Rolls (4 pcs)", description: "Crispy vegetable spring rolls served with sweet chilli dip.", price: "150.00", categorySlug: "chinese", dietaryLabels: ["halal", "vegetarian"], prepTime: 10 },

    // Provider 3: Napoli Pizza & Pasta
    { providerId: provider3.id, slug: "pepperoni-pizza", name: "Pepperoni Feast Pizza (12 inch)", description: "Hand-tossed pizza topped with beef pepperoni and mozzarella.", price: "650.00", categorySlug: "pizza", dietaryLabels: ["halal"], prepTime: 25 },
    { providerId: provider3.id, slug: "margherita-pizza", name: "Margherita Pizza (12 inch)", description: "Classic pizza with tomato sauce, fresh basil, and mozzarella.", price: "520.00", categorySlug: "pizza", dietaryLabels: ["vegetarian"], prepTime: 20 },
    { providerId: provider3.id, slug: "creamy-alfredo-pasta", name: "Creamy Alfredo Pasta", description: "Penne pasta in garlic parmesan cream sauce with grilled chicken.", price: "380.00", categorySlug: "pizza", dietaryLabels: ["halal"], prepTime: 20 },

    // Provider 4: Sweet Tooth Bakery
    { providerId: provider4.id, slug: "chocolate-lava-cake", name: "Chocolate Lava Cake", description: "Warm chocolate cake with molten fudge center.", price: "220.00", categorySlug: "desserts", dietaryLabels: ["vegetarian"], prepTime: 15 },
    { providerId: provider4.id, slug: "classic-cheese-pancake", name: "Classic Cheese Pancake", description: "Fluffy pancakes topped with melted cheese and honey syrup.", price: "180.00", categorySlug: "breakfast", dietaryLabels: ["vegetarian"], prepTime: 15 },
    { providerId: provider4.id, slug: "mango-smoothie", name: "Mango Smoothie", description: "Creamy smoothie made with fresh Alphonso mango pulp.", price: "130.00", categorySlug: "beverages", dietaryLabels: ["vegetarian"], prepTime: 5 },
  ];

  const mealMap = new Map<string, { id: string; name: string; price: string }>();

  for (const m of mealData) {
    const catId = catMap.get(m.categorySlug)!;
    const upserted = await database.meal.upsert({
      where: { providerId_slug: { providerId: m.providerId, slug: m.slug } },
      update: { categoryId: catId, name: m.name, description: m.description, price: m.price, dietaryLabels: m.dietaryLabels, preparationTimeMinutes: m.prepTime, isAvailable: true, isArchived: false },
      create: { providerId: m.providerId, categoryId: catId, slug: m.slug, name: m.name, description: m.description, price: m.price, dietaryLabels: m.dietaryLabels, preparationTimeMinutes: m.prepTime, isAvailable: true },
      select: { id: true, name: true, price: true },
    });
    mealMap.set(`${m.providerId}_${m.slug}`, { id: upserted.id, name: upserted.name, price: upserted.price.toString() });
  }

  // 5. Extra Orders
  const ordersToCreate = [
    {
      id: "seed-order-1",
      orderNumber: "FH-20260721-ORD001",
      customerId: customer1.id,
      customerName: "Sarah Ahmed",
      customerPhone: "+8801711111111",
      providerId: provider1.id,
      providerUserId: providerUser1.id,
      status: "PLACED" as const,
      total: "820.00",
      createdAt: new Date("2026-07-21T11:00:00.000Z"),
      items: [
        { mealId: mealMap.get(`${provider1.id}_kacchi-biryani-special`)!.id, mealName: "Kacchi Biryani Special", unitPrice: "350.00", quantity: 2, lineTotal: "700.00" },
        { mealId: mealMap.get(`${provider1.id}_special-borhani`)!.id, mealName: "Special Borhani", unitPrice: "60.00", quantity: 2, lineTotal: "120.00" },
      ],
    },
    {
      id: "seed-order-2",
      orderNumber: "FH-20260721-ORD002",
      customerId: customer2.id,
      customerName: "Tanvir Hasan",
      customerPhone: "+8801722222222",
      providerId: provider2.id,
      providerUserId: providerUser2.id,
      status: "PREPARING" as const,
      total: "560.00",
      createdAt: new Date("2026-07-21T12:00:00.000Z"),
      items: [
        { mealId: mealMap.get(`${provider2.id}_chicken-fried-rice`)!.id, mealName: "Chicken Fried Rice", unitPrice: "260.00", quantity: 1, lineTotal: "260.00" },
        { mealId: mealMap.get(`${provider2.id}_chilli-chicken-dry`)!.id, mealName: "Chilli Chicken Dry", unitPrice: "300.00", quantity: 1, lineTotal: "300.00" },
      ],
    },
    {
      id: "seed-order-3",
      orderNumber: "FH-20260721-ORD003",
      customerId: customer3.id,
      customerName: "Nusrat Jahan",
      customerPhone: "+8801733333333",
      providerId: provider3.id,
      providerUserId: providerUser3.id,
      status: "READY" as const,
      total: "650.00",
      createdAt: new Date("2026-07-21T13:00:00.000Z"),
      items: [
        { mealId: mealMap.get(`${provider3.id}_pepperoni-pizza`)!.id, mealName: "Pepperoni Feast Pizza (12 inch)", unitPrice: "650.00", quantity: 1, lineTotal: "650.00" },
      ],
    },
    {
      id: "seed-order-4",
      orderNumber: "FH-20260721-ORD004",
      customerId: customer1.id,
      customerName: "Sarah Ahmed",
      customerPhone: "+8801711111111",
      providerId: provider4.id,
      providerUserId: providerUser4.id,
      status: "DELIVERED" as const,
      total: "570.00",
      createdAt: new Date("2026-07-20T14:00:00.000Z"),
      items: [
        { mealId: mealMap.get(`${provider4.id}_chocolate-lava-cake`)!.id, mealName: "Chocolate Lava Cake", unitPrice: "220.00", quantity: 2, lineTotal: "440.00" },
        { mealId: mealMap.get(`${provider4.id}_mango-smoothie`)!.id, mealName: "Mango Smoothie", unitPrice: "130.00", quantity: 1, lineTotal: "130.00" },
      ],
    },
    {
      id: "seed-order-5",
      orderNumber: "FH-20260721-ORD005",
      customerId: customer2.id,
      customerName: "Tanvir Hasan",
      customerPhone: "+8801722222222",
      providerId: provider1.id,
      providerUserId: providerUser1.id,
      status: "DELIVERED" as const,
      total: "340.00",
      createdAt: new Date("2026-07-20T15:00:00.000Z"),
      items: [
        { mealId: mealMap.get(`${provider1.id}_bhuna-khichuri-beef`)!.id, mealName: "Bhuna Khichuri & Beef", unitPrice: "280.00", quantity: 1, lineTotal: "280.00" },
        { mealId: mealMap.get(`${provider1.id}_special-borhani`)!.id, mealName: "Special Borhani", unitPrice: "60.00", quantity: 1, lineTotal: "60.00" },
      ],
    },
    {
      id: "seed-order-6",
      orderNumber: "FH-20260721-ORD006",
      customerId: customer3.id,
      customerName: "Nusrat Jahan",
      customerPhone: "+8801733333333",
      providerId: provider2.id,
      providerUserId: providerUser2.id,
      status: "CANCELLED" as const,
      total: "340.00",
      createdAt: new Date("2026-07-21T09:00:00.000Z"),
      cancellationReason: "Changed my mind",
      items: [
        { mealId: mealMap.get(`${provider2.id}_szechuan-beef-noodles`)!.id, mealName: "Szechuan Beef Noodles", unitPrice: "340.00", quantity: 1, lineTotal: "340.00" },
      ],
    },
  ];

  for (const o of ordersToCreate) {
    await database.order.upsert({
      where: { orderNumber: o.orderNumber },
      update: {},
      create: {
        id: o.id,
        orderNumber: o.orderNumber,
        customerId: o.customerId,
        providerId: o.providerId,
        status: o.status,
        customerName: o.customerName,
        customerPhone: o.customerPhone,
        deliveryAddress: "Dhaka, Bangladesh",
        subtotal: o.total,
        total: o.total,
        createdAt: o.createdAt,
        cancellationReason: o.cancellationReason,
        ...(o.status === "DELIVERED" ? { deliveredAt: o.createdAt } : {}),
        ...(o.status === "CANCELLED" ? { cancelledAt: o.createdAt } : {}),
        items: { create: o.items },
        statusHistory: {
          create: o.status === "PLACED"
            ? { toStatus: "PLACED", actorUser: { connect: { id: o.customerId } }, actorRole: "CUSTOMER", createdAt: o.createdAt }
            : o.status === "CANCELLED"
              ? [
                { toStatus: "PLACED", actorUser: { connect: { id: o.customerId } }, actorRole: "CUSTOMER", createdAt: o.createdAt },
                { fromStatus: "PLACED", toStatus: "CANCELLED", actorUser: { connect: { id: o.customerId } }, actorRole: "CUSTOMER", note: o.cancellationReason, createdAt: new Date(o.createdAt.getTime() + 60_000) },
              ]
              : [
                { toStatus: "PLACED", actorUser: { connect: { id: o.customerId } }, actorRole: "CUSTOMER", createdAt: o.createdAt },
                { fromStatus: "PLACED", toStatus: "PREPARING", actorUser: { connect: { id: o.providerUserId } }, actorRole: "PROVIDER", createdAt: new Date(o.createdAt.getTime() + 60_000) },
                ...(o.status === "READY" || o.status === "DELIVERED" ? [{ fromStatus: "PREPARING" as const, toStatus: "READY" as const, actorUser: { connect: { id: o.providerUserId } }, actorRole: "PROVIDER" as const, createdAt: new Date(o.createdAt.getTime() + 120_000) }] : []),
                ...(o.status === "DELIVERED" ? [{ fromStatus: "READY" as const, toStatus: "DELIVERED" as const, actorUser: { connect: { id: o.providerUserId } }, actorRole: "PROVIDER" as const, createdAt: new Date(o.createdAt.getTime() + 180_000) }] : []),
              ],
        },
      },
    });
  }

  // 6. Extra Reviews
  const lavaCakeMeal = mealMap.get(`${provider4.id}_chocolate-lava-cake`)!;
  const khichuriMeal = mealMap.get(`${provider1.id}_bhuna-khichuri-beef`)!;

  await database.review.upsert({
    where: { customerId_orderId_mealId: { customerId: customer1.id, orderId: "seed-order-4", mealId: lavaCakeMeal.id } },
    update: { rating: 5, comment: "The chocolate lava cake was warm, rich, and absolutely delicious!" },
    create: { customerId: customer1.id, orderId: "seed-order-4", mealId: lavaCakeMeal.id, rating: 5, comment: "The chocolate lava cake was warm, rich, and absolutely delicious!" },
  });

  await database.review.upsert({
    where: { customerId_orderId_mealId: { customerId: customer2.id, orderId: "seed-order-5", mealId: khichuriMeal.id } },
    update: { rating: 4, comment: "Tender beef and aromatic khichuri. Great portion size!" },
    create: { customerId: customer2.id, orderId: "seed-order-5", mealId: khichuriMeal.id, rating: 4, comment: "Tender beef and aromatic khichuri. Great portion size!" },
  });
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
