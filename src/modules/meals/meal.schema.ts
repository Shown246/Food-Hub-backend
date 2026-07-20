import { z } from "zod";
import { resourceId, safeText } from "../../common/validation/schemas.js";

const moneyFilter = z.string()
  .trim()
  .regex(/^\d{1,10}(?:\.\d{1,2})?$/, "Enter a valid monetary amount.");

export const mealListQuerySchema = z.object({
  search: safeText(100).optional(),
  categoryId: resourceId.optional(),
  categorySlug: resourceId.optional(),
  dietary: safeText(50).transform((value) => value.toLowerCase()).optional(),
  providerId: resourceId.optional(),
  minPrice: moneyFilter.optional(),
  maxPrice: moneyFilter.optional(),
  sort: z.enum(["newest", "created_desc", "price_asc", "price_desc", "rating_desc"]).optional(),
  page: z.string().regex(/^\d+$/, "Must be a positive integer.").optional(),
  limit: z.string().regex(/^\d+$/, "Must be a positive integer.").optional(),
}).strict().superRefine(({ minPrice, maxPrice }, context) => {
  if (minPrice !== undefined && maxPrice !== undefined && Number(minPrice) > Number(maxPrice)) {
    context.addIssue({
      code: "custom",
      path: ["maxPrice"],
      message: "Maximum price must not be less than minimum price.",
    });
  }
}).refine(
  ({ categoryId, categorySlug }) => !(categoryId && categorySlug),
  { path: ["categorySlug"], message: "Use either categoryId or categorySlug, not both." },
);

export const mealParamsSchema = z.object({ id: resourceId }).strict();

export type MealListQuery = z.infer<typeof mealListQuerySchema>;
