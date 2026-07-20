type DecimalValue = { toFixed(fractionDigits: number): string } | string | number;

const decimalString = (value: DecimalValue): string =>
  typeof value === "object" ? value.toFixed(2) : Number(value).toFixed(2);

const iso = (value: Date): string => value.toISOString();

export interface PublicUserInput {
  id: string;
  fullName: string;
  profileImageUrl: string | null;
}

export const serializePublicUser = (user: PublicUserInput) => ({
  id: user.id,
  fullName: user.fullName,
  profileImageUrl: user.profileImageUrl,
});

export interface OwnUserInput extends PublicUserInput {
  email: string;
  phone: string | null;
  role: string;
  status: string;
  defaultDeliveryAddress: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const serializeOwnUser = (user: OwnUserInput) => ({
  ...serializePublicUser(user),
  email: user.email,
  phone: user.phone,
  role: user.role,
  status: user.status,
  defaultDeliveryAddress: user.defaultDeliveryAddress,
  createdAt: iso(user.createdAt),
  updatedAt: iso(user.updatedAt),
});

export interface PublicProviderInput {
  id: string;
  name: string;
  description: string;
  address: string;
  phone: string;
  logoUrl: string | null;
  openingHours: string | null;
  acceptingOrders: boolean;
}

export const serializePublicProvider = (provider: PublicProviderInput) => ({
  id: provider.id,
  name: provider.name,
  description: provider.description,
  address: provider.address,
  phone: provider.phone,
  logoUrl: provider.logoUrl,
  openingHours: provider.openingHours,
  acceptingOrders: provider.acceptingOrders,
});

export interface OwnProfileInput extends OwnUserInput {
  providerProfile: PublicProviderInput | null;
}

export const serializeOwnProfile = (profile: OwnProfileInput) => ({
  user: serializeOwnUser(profile),
  providerProfile: profile.providerProfile ? serializePublicProvider(profile.providerProfile) : null,
});

export interface PublicCategoryInput {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  displayOrder: number;
}

export const serializePublicCategory = (category: PublicCategoryInput) => ({
  id: category.id,
  name: category.name,
  slug: category.slug,
  description: category.description,
  displayOrder: category.displayOrder,
});

export interface PublicMealInput {
  id: string;
  name: string;
  slug: string | null;
  description: string;
  price: DecimalValue;
  imageUrl: string | null;
  dietaryLabels: string[];
  preparationTimeMinutes: number | null;
  isAvailable: boolean;
  createdAt: Date;
  provider: PublicProviderInput;
  category: PublicCategoryInput;
}

export interface RatingSummaryInput {
  averageRating: number | null;
  reviewCount: number;
}

export const serializePublicMeal = (meal: PublicMealInput, rating: RatingSummaryInput = {
  averageRating: null,
  reviewCount: 0,
}) => ({
  id: meal.id,
  name: meal.name,
  slug: meal.slug,
  description: meal.description,
  price: decimalString(meal.price),
  imageUrl: meal.imageUrl,
  dietaryLabels: meal.dietaryLabels,
  preparationTimeMinutes: meal.preparationTimeMinutes,
  isAvailable: meal.isAvailable,
  createdAt: iso(meal.createdAt),
  provider: serializePublicProvider(meal.provider),
  category: serializePublicCategory(meal.category),
  rating: {
    average: rating.averageRating === null ? null : Number(rating.averageRating.toFixed(2)),
    count: rating.reviewCount,
  },
});

export interface ProviderMealInput {
  id: string;
  name: string;
  slug: string | null;
  description: string;
  price: DecimalValue;
  imageUrl: string | null;
  dietaryLabels: string[];
  preparationTimeMinutes: number | null;
  isAvailable: boolean;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
  category: PublicCategoryInput & { isActive: boolean };
}

export const serializeProviderMeal = (meal: ProviderMealInput) => ({
  id: meal.id,
  name: meal.name,
  slug: meal.slug,
  description: meal.description,
  price: decimalString(meal.price),
  imageUrl: meal.imageUrl,
  dietaryLabels: meal.dietaryLabels,
  preparationTimeMinutes: meal.preparationTimeMinutes,
  isAvailable: meal.isAvailable,
  isArchived: meal.isArchived,
  createdAt: iso(meal.createdAt),
  updatedAt: iso(meal.updatedAt),
  category: {
    ...serializePublicCategory(meal.category),
    isActive: meal.category.isActive,
  },
});

export interface PublicReviewInput {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
  updatedAt: Date;
  customer: PublicUserInput;
}

export const serializePublicReview = (review: PublicReviewInput) => ({
  id: review.id,
  rating: review.rating,
  comment: review.comment,
  createdAt: iso(review.createdAt),
  updatedAt: iso(review.updatedAt),
  customer: serializePublicUser(review.customer),
});

export interface OrderItemInput {
  id: string;
  mealId: string;
  mealName: string;
  unitPrice: DecimalValue;
  quantity: number;
  itemNote: string | null;
  lineTotal: DecimalValue;
}

export interface OrderInput {
  id: string;
  orderNumber: string;
  status: string;
  paymentMethod: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  deliveryInstructions: string | null;
  subtotal: DecimalValue;
  deliveryFee: DecimalValue;
  tax: DecimalValue;
  serviceFee: DecimalValue;
  total: DecimalValue;
  cancellationReason: string | null;
  cancelledAt: Date | null;
  deliveredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  items: OrderItemInput[];
  provider: PublicProviderInput;
  statusHistory: Array<{
    id: string;
    fromStatus: string | null;
    toStatus: string;
    actorRole: string;
    note: string | null;
    createdAt: Date;
  }>;
}

export const serializeOrder = (order: OrderInput) => ({
  id: order.id,
  orderNumber: order.orderNumber,
  status: order.status,
  paymentMethod: order.paymentMethod,
  customerName: order.customerName,
  customerPhone: order.customerPhone,
  deliveryAddress: order.deliveryAddress,
  deliveryInstructions: order.deliveryInstructions,
  subtotal: decimalString(order.subtotal),
  deliveryFee: decimalString(order.deliveryFee),
  tax: decimalString(order.tax),
  serviceFee: decimalString(order.serviceFee),
  total: decimalString(order.total),
  cancellationReason: order.cancellationReason,
  cancelledAt: order.cancelledAt ? iso(order.cancelledAt) : null,
  deliveredAt: order.deliveredAt ? iso(order.deliveredAt) : null,
  createdAt: iso(order.createdAt),
  updatedAt: iso(order.updatedAt),
  provider: serializePublicProvider(order.provider),
  items: order.items.map((item) => ({
    id: item.id,
    mealId: item.mealId,
    mealName: item.mealName,
    unitPrice: decimalString(item.unitPrice),
    quantity: item.quantity,
    itemNote: item.itemNote,
    lineTotal: decimalString(item.lineTotal),
  })),
  statusHistory: order.statusHistory.map((history) => ({
    id: history.id,
    fromStatus: history.fromStatus,
    toStatus: history.toStatus,
    actorRole: history.actorRole,
    note: history.note,
    createdAt: iso(history.createdAt),
  })),
});

export interface OrderSummaryInput {
  id: string;
  orderNumber: string;
  status: string;
  paymentMethod: string;
  subtotal: DecimalValue;
  deliveryFee: DecimalValue;
  tax: DecimalValue;
  serviceFee: DecimalValue;
  total: DecimalValue;
  cancelledAt: Date | null;
  deliveredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  provider: PublicProviderInput;
  _count: { items: number };
}

export const serializeOrderSummary = (order: OrderSummaryInput) => ({
  id: order.id,
  orderNumber: order.orderNumber,
  status: order.status,
  paymentMethod: order.paymentMethod,
  subtotal: decimalString(order.subtotal),
  deliveryFee: decimalString(order.deliveryFee),
  tax: decimalString(order.tax),
  serviceFee: decimalString(order.serviceFee),
  total: decimalString(order.total),
  itemCount: order._count.items,
  cancelledAt: order.cancelledAt ? iso(order.cancelledAt) : null,
  deliveredAt: order.deliveredAt ? iso(order.deliveredAt) : null,
  createdAt: iso(order.createdAt),
  updatedAt: iso(order.updatedAt),
  provider: serializePublicProvider(order.provider),
});

export const serializeProviderOrderSummary = (order: OrderSummaryInput & { customerName: string }) => ({
  ...serializeOrderSummary(order),
  customerName: order.customerName,
});
