import { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../../lib/prisma.js";
import { NotFoundError } from "../../common/errors/app-error.js";
import { paginationMeta, parsePagination } from "../../common/pagination/pagination.js";
import { publicMealDetailSelect, publicMealSelect } from "../../common/serialization/selectors.js";
import { serializePublicMeal, serializePublicReview } from "../../common/serialization/serializers.js";
import type { MealListQuery } from "./meal.schema.js";

export interface MealServiceDependencies {
  database: typeof prisma;
  schemaName?: string;
}

const orderableWhere = (query: MealListQuery): Prisma.MealWhereInput => ({
  isAvailable: true,
  isArchived: false,
  category: { is: { isActive: true } },
  provider: {
    is: {
      acceptingOrders: true,
      user: { is: { status: "ACTIVE" } },
    },
  },
  ...(query.search ? {
    OR: [
      { name: { contains: query.search, mode: "insensitive" } },
      { description: { contains: query.search, mode: "insensitive" } },
    ],
  } : {}),
  ...(query.categoryId ? {
    category: {
      is: {
        isActive: true,
        OR: [{ id: query.categoryId }, { slug: query.categoryId }],
      },
    },
  } : {}),
  ...(query.categorySlug ? {
    category: { is: { isActive: true, slug: query.categorySlug } },
  } : {}),
  ...(query.dietary ? { dietaryLabels: { has: query.dietary } } : {}),
  ...(query.providerId ? { providerId: query.providerId } : {}),
  ...(query.minPrice || query.maxPrice ? {
    price: {
      ...(query.minPrice ? { gte: query.minPrice } : {}),
      ...(query.maxPrice ? { lte: query.maxPrice } : {}),
    },
  } : {}),
});

const ratingSortedIds = async (
  database: typeof prisma,
  query: MealListQuery,
  skip: number,
  take: number,
  schemaName: string,
): Promise<string[]> => {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`m."isAvailable" = true`,
    Prisma.sql`m."isArchived" = false`,
    Prisma.sql`c."isActive" = true`,
    Prisma.sql`p."acceptingOrders" = true`,
    Prisma.sql`u."status" = 'ACTIVE'`,
  ];
  if (query.search) {
    const pattern = `%${query.search}%`;
    conditions.push(Prisma.sql`(m."name" ILIKE ${pattern} OR m."description" ILIKE ${pattern})`);
  }
  if (query.categoryId) {
    conditions.push(Prisma.sql`(m."categoryId" = ${query.categoryId} OR c."slug" = ${query.categoryId})`);
  }
  if (query.categorySlug) conditions.push(Prisma.sql`c."slug" = ${query.categorySlug}`);
  if (query.dietary) conditions.push(Prisma.sql`m."dietaryLabels" @> ARRAY[${query.dietary}]::text[]`);
  if (query.providerId) conditions.push(Prisma.sql`m."providerId" = ${query.providerId}`);
  if (query.minPrice) conditions.push(Prisma.sql`m."price" >= ${query.minPrice}::numeric`);
  if (query.maxPrice) conditions.push(Prisma.sql`m."price" <= ${query.maxPrice}::numeric`);

  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schemaName)) {
    throw new Error("Invalid internal database schema name");
  }
  const schema = Prisma.raw(`"${schemaName}"`);
  const rows = await database.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT m."id"
    FROM ${schema}."meal" m
    JOIN ${schema}."category" c ON c."id" = m."categoryId"
    JOIN ${schema}."provider_profile" p ON p."id" = m."providerId"
    JOIN ${schema}."user" u ON u."id" = p."userId"
    LEFT JOIN ${schema}."review" r ON r."mealId" = m."id" AND r."isActive" = true
    WHERE ${Prisma.join(conditions, " AND ")}
    GROUP BY m."id", m."createdAt"
    ORDER BY AVG(r."rating") DESC NULLS LAST, COUNT(r."id") DESC, m."createdAt" DESC, m."id" ASC
    OFFSET ${skip} LIMIT ${take}
  `);
  return rows.map(({ id }) => id);
};

const mealOrderBy = (sort: MealListQuery["sort"]): Prisma.MealOrderByWithRelationInput[] => {
  switch (sort) {
    case "price_asc": return [{ price: "asc" }, { id: "asc" }];
    case "price_desc": return [{ price: "desc" }, { id: "asc" }];
    default: return [{ createdAt: "desc" }, { id: "asc" }];
  }
};

export const createMealService = (
  { database, schemaName = "public" }: MealServiceDependencies = { database: prisma },
) => ({
  async listOrderable(query: MealListQuery) {
    const pagination = parsePagination(query);
    const where = orderableWhere(query);
    const [totalItems, selectedIds] = await Promise.all([
      database.meal.count({ where }),
      query.sort === "rating_desc"
        ? ratingSortedIds(database, query, pagination.skip, pagination.take, schemaName)
        : database.meal.findMany({
          where,
          orderBy: mealOrderBy(query.sort),
          skip: pagination.skip,
          take: pagination.take,
          select: { id: true },
        }).then((meals) => meals.map(({ id }) => id)),
    ]);

    if (selectedIds.length === 0) {
      return { meals: [], meta: paginationMeta(pagination.page, pagination.limit, totalItems) };
    }

    const [mealRecords, ratings] = await Promise.all([
      database.meal.findMany({
        where: { ...where, id: { in: selectedIds } },
        select: publicMealSelect,
      }),
      database.review.groupBy({
        by: ["mealId"],
        where: { mealId: { in: selectedIds }, isActive: true },
        _avg: { rating: true },
        _count: { rating: true },
      }),
    ]);
    const mealsById = new Map(mealRecords.map((meal) => [meal.id, meal]));
    const ratingsByMeal = new Map(ratings.map((rating) => [rating.mealId, rating]));
    const meals = selectedIds.flatMap((id) => {
      const meal = mealsById.get(id);
      if (!meal) return [];
      const rating = ratingsByMeal.get(id);
      return [serializePublicMeal(meal, {
        averageRating: rating?._avg.rating ?? null,
        reviewCount: rating?._count.rating ?? 0,
      })];
    });
    return { meals, meta: paginationMeta(pagination.page, pagination.limit, totalItems) };
  },

  async getOrderable(mealId: string) {
    const where = { ...orderableWhere({}), id: mealId };
    const [meal, rating] = await Promise.all([
      database.meal.findFirst({ where, select: publicMealDetailSelect }),
      database.review.aggregate({
        where: { mealId, isActive: true },
        _avg: { rating: true },
        _count: { rating: true },
      }),
    ]);
    if (!meal) throw new NotFoundError("The meal was not found.", "MEAL_NOT_FOUND");
    return {
      ...serializePublicMeal(meal, {
        averageRating: rating._avg.rating,
        reviewCount: rating._count.rating,
      }),
      recentReviews: meal.reviews.map(serializePublicReview),
    };
  },
});

export const mealService = createMealService();
export type MealService = ReturnType<typeof createMealService>;
