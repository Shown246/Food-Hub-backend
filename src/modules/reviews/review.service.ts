import type { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../../lib/prisma.js";
import { ConflictError, NotFoundError } from "../../common/errors/app-error.js";
import { paginationMeta, parsePagination } from "../../common/pagination/pagination.js";
import { publicReviewSelect } from "../../common/serialization/selectors.js";
import { serializePublicReview } from "../../common/serialization/serializers.js";
import type { CreateReviewInput, ReviewListQuery, UpdateReviewInput } from "./review.schema.js";

export interface ReviewServiceDependencies {
  database: typeof prisma;
}

const isUniqueConstraintError = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "code" in error && error.code === "P2002";

export const reviewOrderBy = (
  sort: ReviewListQuery["sort"],
): Prisma.ReviewOrderByWithRelationInput[] => {
  switch (sort) {
    case "oldest": return [{ createdAt: "asc" }, { id: "asc" }];
    case "rating_desc": return [{ rating: "desc" }, { createdAt: "desc" }, { id: "desc" }];
    case "rating_asc": return [{ rating: "asc" }, { createdAt: "desc" }, { id: "desc" }];
    default: return [{ createdAt: "desc" }, { id: "desc" }];
  }
};

export const createReviewService = (
  { database }: ReviewServiceDependencies = { database: prisma },
) => ({
  async listForPublicMeal(mealId: string, query: ReviewListQuery) {
    const meal = await database.meal.findFirst({
      where: {
        id: mealId,
        isAvailable: true,
        isArchived: false,
        category: { is: { isActive: true } },
        provider: {
          is: {
            acceptingOrders: true,
            user: { is: { status: "ACTIVE" } },
          },
        },
      },
      select: { id: true },
    });
    if (!meal) throw new NotFoundError("The meal was not found.", "MEAL_NOT_FOUND");

    const pagination = parsePagination(query);
    const where = { mealId, isActive: true };
    const [reviews, totalItems] = await Promise.all([
      database.review.findMany({
        where,
        orderBy: reviewOrderBy(query.sort),
        skip: pagination.skip,
        take: pagination.take,
        select: publicReviewSelect,
      }),
      database.review.count({ where }),
    ]);
    return {
      reviews: reviews.map(serializePublicReview),
      meta: paginationMeta(pagination.page, pagination.limit, totalItems),
    };
  },

  async create(customerId: string, input: CreateReviewInput) {
    const order = await database.order.findFirst({
      where: { id: input.orderId, customerId },
      select: {
        status: true,
        items: { where: { mealId: input.mealId }, take: 1, select: { id: true } },
      },
    });
    if (!order) throw new NotFoundError("The order was not found.", "ORDER_NOT_FOUND");
    if (order.status !== "DELIVERED") {
      throw new ConflictError("Only delivered orders can be reviewed.", "REVIEW_ORDER_NOT_DELIVERED");
    }
    if (order.items.length === 0) {
      throw new ConflictError("The meal is not part of this order.", "REVIEW_MEAL_NOT_IN_ORDER");
    }

    const existing = await database.review.findUnique({
      where: {
        customerId_orderId_mealId: {
          customerId,
          orderId: input.orderId,
          mealId: input.mealId,
        },
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictError("This meal has already been reviewed for this order.", "REVIEW_ALREADY_EXISTS");
    }

    try {
      const review = await database.review.create({
        data: {
          customerId,
          orderId: input.orderId,
          mealId: input.mealId,
          rating: input.rating,
          comment: input.comment ?? null,
        },
        select: publicReviewSelect,
      });
      return serializePublicReview(review);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictError("This meal has already been reviewed for this order.", "REVIEW_ALREADY_EXISTS");
      }
      throw error;
    }
  },

  async update(customerId: string, reviewId: string, input: UpdateReviewInput) {
    return database.$transaction(async (transaction) => {
      const updated = await transaction.review.updateMany({
        where: { id: reviewId, customerId, isActive: true },
        data: {
          ...(input.rating !== undefined ? { rating: input.rating } : {}),
          ...(input.comment !== undefined ? { comment: input.comment } : {}),
        },
      });
      if (updated.count !== 1) {
        throw new NotFoundError("The review was not found.", "REVIEW_NOT_FOUND");
      }
      const review = await transaction.review.findUniqueOrThrow({
        where: { id: reviewId },
        select: publicReviewSelect,
      });
      return serializePublicReview(review);
    });
  },

  async remove(customerId: string, reviewId: string) {
    const updated = await database.review.updateMany({
      where: { id: reviewId, customerId, isActive: true },
      data: { isActive: false },
    });
    if (updated.count !== 1) {
      throw new NotFoundError("The review was not found.", "REVIEW_NOT_FOUND");
    }
    return { id: reviewId, deleted: true };
  },
});

export const reviewService = createReviewService();
export type ReviewService = ReturnType<typeof createReviewService>;
