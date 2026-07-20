import type { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../../lib/prisma.js";
import { ConflictError, NotFoundError } from "../../common/errors/app-error.js";
import type { CreateAdminCategoryInput, UpdateAdminCategoryInput } from "./admin-category.schema.js";
import { slugifyCategory } from "./admin-category.schema.js";

export interface AdminCategoryServiceDependencies {
  database: typeof prisma;
}

const adminCategorySelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  isActive: true,
  displayOrder: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { meals: true } },
} satisfies Prisma.CategorySelect;

type AdminCategoryRecord = Prisma.CategoryGetPayload<{ select: typeof adminCategorySelect }>;

const serializeAdminCategory = (category: AdminCategoryRecord) => ({
  id: category.id,
  name: category.name,
  slug: category.slug,
  description: category.description,
  isActive: category.isActive,
  displayOrder: category.displayOrder,
  mealCount: category._count.meals,
  createdAt: category.createdAt.toISOString(),
  updatedAt: category.updatedAt.toISOString(),
});

const isUniqueConstraintError = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
const isForeignKeyConstraintError = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "code" in error && error.code === "P2003";

const categoryNotFound = () => new NotFoundError("The category was not found.", "CATEGORY_NOT_FOUND");
const categoryNameConflict = () => new ConflictError(
  "A category with this name already exists.",
  "CATEGORY_NAME_EXISTS",
);
const categorySlugConflict = () => new ConflictError(
  "A category with this slug already exists.",
  "CATEGORY_SLUG_EXISTS",
);
const categoryInUse = () => new ConflictError(
  "This category is referenced by meals and should be deactivated instead.",
  "CATEGORY_IN_USE",
);

const slugCandidate = (name: string, attempt: number): string => {
  const base = slugifyCategory(name) || "category";
  const suffix = attempt === 1 ? "" : `-${attempt}`;
  return `${base.slice(0, 120 - suffix.length).replace(/-+$/g, "")}${suffix}`;
};

const allocateSlug = async (
  transaction: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  name: string,
  excludeId?: string,
): Promise<string> => {
  for (let attempt = 1; attempt <= 1_000; attempt += 1) {
    const slug = slugCandidate(name, attempt);
    const exists = await transaction.category.findFirst({
      where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
    if (!exists) return slug;
  }
  throw categorySlugConflict();
};

export const createAdminCategoryService = (
  { database }: AdminCategoryServiceDependencies = { database: prisma },
) => ({
  async list() {
    const categories = await database.category.findMany({
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }, { id: "asc" }],
      select: adminCategorySelect,
    });
    return categories.map(serializeAdminCategory);
  },

  async create(actorUserId: string, input: CreateAdminCategoryInput, requestId?: string) {
    for (let attempt = 1; attempt <= 1_000; attempt += 1) {
      try {
        const category = await database.$transaction(async (transaction) => {
          const duplicateName = await transaction.category.findFirst({
            where: { name: input.name },
            select: { id: true },
          });
          if (duplicateName) throw categoryNameConflict();
          const created = await transaction.category.create({
            data: {
              name: input.name,
              slug: slugCandidate(input.name, attempt),
              description: input.description ?? null,
              displayOrder: input.displayOrder ?? 0,
              isActive: input.isActive ?? true,
            },
            select: adminCategorySelect,
          });
          await transaction.auditEvent.create({
            data: {
              actorType: "USER",
              actorUserId,
              actorRole: "ADMIN",
              action: "CATEGORY_CREATED",
              entityType: "CATEGORY",
              entityId: created.id,
              requestId,
              metadata: { name: created.name, slug: created.slug, isActive: created.isActive },
            },
          });
          return created;
        });
        return serializeAdminCategory(category);
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error;
        const duplicateName = await database.category.findFirst({ where: { name: input.name }, select: { id: true } });
        if (duplicateName) throw categoryNameConflict();
      }
    }
    throw categorySlugConflict();
  },

  async update(
    actorUserId: string,
    categoryId: string,
    input: UpdateAdminCategoryInput,
    requestId?: string,
  ) {
    try {
      const category = await database.$transaction(async (transaction) => {
        const current = await transaction.category.findUnique({
          where: { id: categoryId },
          select: adminCategorySelect,
        });
        if (!current) throw categoryNotFound();

        if (input.name !== undefined && input.name !== current.name) {
          const duplicateName = await transaction.category.findFirst({
            where: { name: input.name, id: { not: categoryId } },
            select: { id: true },
          });
          if (duplicateName) throw categoryNameConflict();
        }

        let nextSlug = current.slug;
        if (input.slug !== undefined) {
          const duplicateSlug = await transaction.category.findFirst({
            where: { slug: input.slug, id: { not: categoryId } },
            select: { id: true },
          });
          if (duplicateSlug) throw categorySlugConflict();
          nextSlug = input.slug;
        } else if (input.name !== undefined && input.name !== current.name) {
          nextSlug = await allocateSlug(transaction, input.name, categoryId);
        }

        const changes = {
          name: input.name ?? current.name,
          slug: nextSlug,
          description: input.description !== undefined ? input.description : current.description,
          displayOrder: input.displayOrder ?? current.displayOrder,
          isActive: input.isActive ?? current.isActive,
        };
        const changedFields = (Object.keys(changes) as Array<keyof typeof changes>)
          .filter((field) => changes[field] !== current[field]);
        if (changedFields.length === 0) return current;

        const updated = await transaction.category.update({
          where: { id: categoryId },
          data: changes,
          select: adminCategorySelect,
        });
        await transaction.auditEvent.create({
          data: {
            actorType: "USER",
            actorUserId,
            actorRole: "ADMIN",
            action: current.isActive && !updated.isActive ? "CATEGORY_DEACTIVATED" : "CATEGORY_UPDATED",
            entityType: "CATEGORY",
            entityId: categoryId,
            requestId,
            metadata: { changedFields, previousSlug: current.slug, slug: updated.slug },
          },
        });
        return updated;
      });
      return serializeAdminCategory(category);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const duplicateName = input.name
          ? await database.category.findFirst({ where: { name: input.name, id: { not: categoryId } }, select: { id: true } })
          : null;
        if (duplicateName) throw categoryNameConflict();
        throw categorySlugConflict();
      }
      throw error;
    }
  },

  async remove(actorUserId: string, categoryId: string, requestId?: string) {
    try {
      return await database.$transaction(async (transaction) => {
        const category = await transaction.category.findUnique({
          where: { id: categoryId },
          select: adminCategorySelect,
        });
        if (!category) throw categoryNotFound();
        if (category._count.meals > 0) throw categoryInUse();
        await transaction.category.delete({ where: { id: categoryId } });
        await transaction.auditEvent.create({
          data: {
            actorType: "USER",
            actorUserId,
            actorRole: "ADMIN",
            action: "CATEGORY_DELETED",
            entityType: "CATEGORY",
            entityId: categoryId,
            requestId,
            metadata: { name: category.name, slug: category.slug, wasActive: category.isActive },
          },
        });
        return { id: categoryId, deleted: true };
      });
    } catch (error) {
      if (isForeignKeyConstraintError(error)) throw categoryInUse();
      throw error;
    }
  },
});

export const adminCategoryService = createAdminCategoryService();
export type AdminCategoryService = ReturnType<typeof createAdminCategoryService>;
