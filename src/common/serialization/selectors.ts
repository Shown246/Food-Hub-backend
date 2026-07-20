import type { Prisma } from "../../../generated/prisma/client.js";

export const publicUserSelect = {
  id: true,
  fullName: true,
  profileImageUrl: true,
} satisfies Prisma.UserSelect;

export const ownUserSelect = {
  ...publicUserSelect,
  email: true,
  phone: true,
  role: true,
  status: true,
  defaultDeliveryAddress: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

export const publicProviderSelect = {
  id: true,
  name: true,
  description: true,
  address: true,
  phone: true,
  logoUrl: true,
  openingHours: true,
  acceptingOrders: true,
} satisfies Prisma.ProviderProfileSelect;

export const ownProfileSelect = {
  ...ownUserSelect,
  providerProfile: { select: publicProviderSelect },
} satisfies Prisma.UserSelect;

export const publicCategorySelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  displayOrder: true,
} satisfies Prisma.CategorySelect;

export const publicMealSelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  price: true,
  imageUrl: true,
  dietaryLabels: true,
  preparationTimeMinutes: true,
  isAvailable: true,
  createdAt: true,
  provider: { select: publicProviderSelect },
  category: { select: publicCategorySelect },
} satisfies Prisma.MealSelect;

export const publicReviewSelect = {
  id: true,
  rating: true,
  comment: true,
  createdAt: true,
  updatedAt: true,
  customer: { select: publicUserSelect },
} satisfies Prisma.ReviewSelect;

export const publicMealDetailSelect = {
  ...publicMealSelect,
  reviews: {
    where: { isActive: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 5,
    select: publicReviewSelect,
  },
} satisfies Prisma.MealSelect;

export const providerMealSelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  price: true,
  imageUrl: true,
  dietaryLabels: true,
  preparationTimeMinutes: true,
  isAvailable: true,
  isArchived: true,
  createdAt: true,
  updatedAt: true,
  category: {
    select: {
      ...publicCategorySelect,
      isActive: true,
    },
  },
} satisfies Prisma.MealSelect;

export const safeOrderSelect = {
  id: true,
  orderNumber: true,
  status: true,
  paymentMethod: true,
  customerName: true,
  customerPhone: true,
  deliveryAddress: true,
  deliveryInstructions: true,
  subtotal: true,
  deliveryFee: true,
  tax: true,
  serviceFee: true,
  total: true,
  cancellationReason: true,
  cancelledAt: true,
  deliveredAt: true,
  createdAt: true,
  updatedAt: true,
  provider: { select: publicProviderSelect },
  items: {
    select: {
      id: true,
      mealId: true,
      mealName: true,
      unitPrice: true,
      quantity: true,
      itemNote: true,
      lineTotal: true,
    },
  },
  statusHistory: {
    select: {
      id: true,
      fromStatus: true,
      toStatus: true,
      actorRole: true,
      note: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  },
} satisfies Prisma.OrderSelect;

export const orderSummarySelect = {
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
  provider: { select: publicProviderSelect },
  _count: { select: { items: true } },
} satisfies Prisma.OrderSelect;

export const providerOrderSummarySelect = {
  ...orderSummarySelect,
  customerName: true,
} satisfies Prisma.OrderSelect;
