import { z } from "zod";
import { resourceId, safeText } from "../../common/validation/schemas.js";

const moneyFilter = z.string()
  .trim()
  .regex(/^\d{1,10}(?:\.\d{1,2})?$/, "Enter a valid monetary amount.");

const categorySlugFilter = z.string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9_-]+$/, "Invalid category slug");

export const mealListQuerySchema = z.object({
  search: safeText(100).optional(),
  category: categorySlugFilter.optional(),
  categoryId: resourceId.optional(),
  categorySlug: categorySlugFilter.optional(),
  dietary: safeText(50).transform((value) => value.toLowerCase()).optional(),
  provider: resourceId.optional(),
  providerId: resourceId.optional(),
  minPrice: moneyFilter.optional(),
  maxPrice: moneyFilter.optional(),
  sort: z.enum(["newest", "created_desc", "price_asc", "price_desc", "rating_desc"]).optional(),
  page: z.string().regex(/^\d+$/, "Must be a positive integer.").optional(),
  limit: z.string().regex(/^\d+$/, "Must be a positive integer.").optional(),
}).strict().superRefine(({ minPrice, maxPrice, category, categoryId, categorySlug, provider, providerId }, context) => {
  if (minPrice !== undefined && maxPrice !== undefined && Number(minPrice) > Number(maxPrice)) {
    context.addIssue({
      code: "custom",
      path: ["maxPrice"],
      message: "Maximum price must not be less than minimum price.",
    });
  }
  const effectiveCategorySlug = category ?? categorySlug;
  if (categoryId && effectiveCategorySlug) {
    context.addIssue({
      code: "custom",
      path: [category !== undefined ? "category" : "categorySlug"],
      message: "Use either categoryId or category/categorySlug, not both.",
    });
  }
  if (category !== undefined && categorySlug !== undefined && category !== categorySlug) {
    context.addIssue({
      code: "custom",
      path: ["category"],
      message: "Conflicting category and categorySlug parameters provided.",
    });
  }
  if (provider !== undefined && providerId !== undefined && provider !== providerId) {
    context.addIssue({
      code: "custom",
      path: ["providerId"],
      message: "Conflicting provider and providerId parameters provided.",
    });
  }
});

export const mealParamsSchema = z.object({ id: resourceId }).strict();

export type MealListQuery = z.infer<typeof mealListQuerySchema>;
