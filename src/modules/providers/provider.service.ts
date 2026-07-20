import type { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../../lib/prisma.js";
import { NotFoundError } from "../../common/errors/app-error.js";
import { paginationMeta, parsePagination } from "../../common/pagination/pagination.js";
import { publicMealSelect, publicProviderSelect } from "../../common/serialization/selectors.js";
import { serializePublicMeal, serializePublicProvider } from "../../common/serialization/serializers.js";
import type { ProviderListQuery } from "./provider.schema.js";

export interface ProviderServiceDependencies {
  database: typeof prisma;
}

const activeMenuWhere = {
  isAvailable: true,
  isArchived: false,
  category: { is: { isActive: true } },
} satisfies Prisma.MealWhereInput;

const publicProviderWhere = (query: ProviderListQuery): Prisma.ProviderProfileWhereInput => ({
  user: { is: { status: "ACTIVE" } },
  ...(query.search ? { name: { contains: query.search, mode: "insensitive" } } : {}),
  ...(query.acceptingOrders !== undefined ? { acceptingOrders: query.acceptingOrders } : {}),
  ...(query.categoryId ? {
    meals: {
      some: {
        ...activeMenuWhere,
        categoryId: query.categoryId,
      },
    },
  } : {}),
});

const providerListSelect = {
  ...publicProviderSelect,
  _count: { select: { meals: { where: activeMenuWhere } } },
} satisfies Prisma.ProviderProfileSelect;

export const createProviderService = (
  { database }: ProviderServiceDependencies = { database: prisma },
) => ({
  async listPublic(query: ProviderListQuery) {
    const pagination = parsePagination(query);
    const where = publicProviderWhere(query);
    const [totalItems, providers] = await Promise.all([
      database.providerProfile.count({ where }),
      database.providerProfile.findMany({
        where,
        orderBy: [{ name: "asc" }, { id: "asc" }],
        skip: pagination.skip,
        take: pagination.take,
        select: providerListSelect,
      }),
    ]);
    return {
      providers: providers.map((provider) => ({
        ...serializePublicProvider(provider),
        activeMealCount: provider._count.meals,
      })),
      meta: paginationMeta(pagination.page, pagination.limit, totalItems),
    };
  },

  async getPublic(providerId: string) {
    const provider = await database.providerProfile.findFirst({
      where: { id: providerId, user: { is: { status: "ACTIVE" } } },
      select: publicProviderSelect,
    });
    if (!provider) throw new NotFoundError("The provider was not found.", "PROVIDER_NOT_FOUND");

    const meals = await database.meal.findMany({
      where: { providerId, ...activeMenuWhere },
      orderBy: [
        { category: { displayOrder: "asc" } },
        { category: { name: "asc" } },
        { name: "asc" },
        { id: "asc" },
      ],
      select: publicMealSelect,
    });
    const ratings = meals.length === 0 ? [] : await database.review.groupBy({
      by: ["mealId"],
      where: { mealId: { in: meals.map(({ id }) => id) }, isActive: true },
      _avg: { rating: true },
      _count: { rating: true },
    });
    const ratingsByMeal = new Map(ratings.map((rating) => [rating.mealId, rating]));
    return {
      provider: serializePublicProvider(provider),
      menu: meals.map((meal) => {
        const rating = ratingsByMeal.get(meal.id);
        return serializePublicMeal(meal, {
          averageRating: rating?._avg.rating ?? null,
          reviewCount: rating?._count.rating ?? 0,
        });
      }),
    };
  },
});

export const providerService = createProviderService();
export type ProviderService = ReturnType<typeof createProviderService>;
