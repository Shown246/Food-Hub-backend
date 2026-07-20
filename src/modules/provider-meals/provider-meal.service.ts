import { prisma } from "../../../lib/prisma.js";
import { ConflictError, NotFoundError } from "../../common/errors/app-error.js";
import { paginationMeta, parsePagination } from "../../common/pagination/pagination.js";
import { providerMealSelect } from "../../common/serialization/selectors.js";
import { serializeProviderMeal } from "../../common/serialization/serializers.js";
import type {
  CreateProviderMealInput,
  ProviderMealAvailabilityInput,
  ProviderMealListQuery,
  UpdateProviderMealInput,
} from "./provider-meal.schema.js";

export interface ProviderMealServiceDependencies {
  database: typeof prisma;
}

const mealNotFound = () => new NotFoundError("The meal was not found.", "MEAL_NOT_FOUND");

export const createProviderMealService = (
  { database }: ProviderMealServiceDependencies = { database: prisma },
) => ({
  async listOwn(providerId: string, query: ProviderMealListQuery) {
    const pagination = parsePagination(query);
    const where = {
      providerId,
      isAvailable: query.availability ?? true,
      isArchived: query.archived ?? false,
      ...(query.search ? {
        OR: [
          { name: { contains: query.search, mode: "insensitive" as const } },
          { description: { contains: query.search, mode: "insensitive" as const } },
        ],
      } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    };
    const [totalItems, meals] = await Promise.all([
      database.meal.count({ where }),
      database.meal.findMany({
        where,
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        skip: pagination.skip,
        take: pagination.take,
        select: providerMealSelect,
      }),
    ]);
    return {
      meals: meals.map(serializeProviderMeal),
      meta: paginationMeta(pagination.page, pagination.limit, totalItems),
    };
  },

  async create(providerId: string, input: CreateProviderMealInput) {
    const meal = await database.$transaction(async (transaction) => {
      const [provider, category] = await Promise.all([
        transaction.providerProfile.findFirst({
          where: { id: providerId, user: { is: { status: "ACTIVE" } } },
          select: { id: true },
        }),
        transaction.category.findFirst({
          where: { id: input.categoryId, isActive: true },
          select: { id: true },
        }),
      ]);
      if (!provider) throw new ConflictError("The provider cannot publish meals.", "PROVIDER_NOT_ACTIVE");
      if (!category) throw new ConflictError("The selected category is not active.", "CATEGORY_NOT_ACTIVE");
      return transaction.meal.create({
        data: {
          providerId,
          name: input.name,
          description: input.description,
          price: input.price,
          categoryId: input.categoryId,
          imageUrl: input.imageUrl,
          dietaryLabels: input.dietaryLabels,
          preparationTimeMinutes: input.preparationTimeMinutes,
          isAvailable: input.isAvailable,
        },
        select: providerMealSelect,
      });
    });
    return serializeProviderMeal(meal);
  },

  async update(providerId: string, mealId: string, input: UpdateProviderMealInput) {
    const { updatedAt, ...changes } = input;
    if (changes.categoryId) {
      const category = await database.category.findFirst({
        where: { id: changes.categoryId, isActive: true },
        select: { id: true },
      });
      if (!category) throw new ConflictError("The selected category is not active.", "CATEGORY_NOT_ACTIVE");
    }

    const owned = await database.meal.findFirst({
      where: { id: mealId, providerId },
      select: { id: true },
    });
    if (!owned) throw mealNotFound();

    const result = await database.meal.updateMany({
      where: {
        id: mealId,
        providerId,
        ...(updatedAt ? { updatedAt: new Date(updatedAt) } : {}),
      },
      data: changes,
    });
    if (result.count === 0) {
      throw new ConflictError("The meal was changed by another request.", "MEAL_UPDATE_CONFLICT");
    }
    const meal = await database.meal.findFirst({
      where: { id: mealId, providerId },
      select: providerMealSelect,
    });
    if (!meal) throw mealNotFound();
    return serializeProviderMeal(meal);
  },

  async setAvailability(providerId: string, mealId: string, input: ProviderMealAvailabilityInput) {
    const owned = await database.meal.findFirst({
      where: { id: mealId, providerId },
      select: { isArchived: true },
    });
    if (!owned) throw mealNotFound();
    if (owned.isArchived) {
      throw new ConflictError("Restore the meal before changing availability.", "MEAL_ARCHIVED");
    }
    const meal = await database.meal.update({
      where: { id: mealId },
      data: { isAvailable: input.isAvailable },
      select: providerMealSelect,
    });
    return serializeProviderMeal(meal);
  },

  async archive(providerId: string, mealId: string, actorUserId: string, requestId?: string) {
    const meal = await database.$transaction(async (transaction) => {
      const owned = await transaction.meal.findFirst({
        where: { id: mealId, providerId },
        select: { isArchived: true, isAvailable: true },
      });
      if (!owned) throw mealNotFound();
      if (owned.isArchived) {
        return transaction.meal.findUniqueOrThrow({ where: { id: mealId }, select: providerMealSelect });
      }
      const archived = await transaction.meal.update({
        where: { id: mealId },
        data: { isArchived: true, isAvailable: false },
        select: providerMealSelect,
      });
      await transaction.auditEvent.create({
        data: {
          actorType: "USER",
          actorUserId,
          actorRole: "PROVIDER",
          action: "MEAL_ARCHIVED",
          entityType: "MEAL",
          entityId: mealId,
          requestId,
          metadata: { providerId, previousAvailability: owned.isAvailable },
        },
      });
      return archived;
    });
    return serializeProviderMeal(meal);
  },

  async restore(providerId: string, mealId: string, actorUserId: string, requestId?: string) {
    const meal = await database.$transaction(async (transaction) => {
      const owned = await transaction.meal.findFirst({
        where: { id: mealId, providerId },
        select: { isArchived: true },
      });
      if (!owned) throw mealNotFound();
      if (!owned.isArchived) {
        return transaction.meal.findUniqueOrThrow({ where: { id: mealId }, select: providerMealSelect });
      }
      const restored = await transaction.meal.update({
        where: { id: mealId },
        data: { isArchived: false, isAvailable: false },
        select: providerMealSelect,
      });
      await transaction.auditEvent.create({
        data: {
          actorType: "USER",
          actorUserId,
          actorRole: "PROVIDER",
          action: "MEAL_RESTORED",
          entityType: "MEAL",
          entityId: mealId,
          requestId,
          metadata: { providerId, restoredAvailability: false },
        },
      });
      return restored;
    });
    return serializeProviderMeal(meal);
  },
});

export const providerMealService = createProviderMealService();
export type ProviderMealService = ReturnType<typeof createProviderMealService>;
