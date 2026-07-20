import { z } from "zod";
import { resourceId, safeText } from "../../common/validation/schemas.js";

export const slugifyCategory = (value: string): string => value
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 120)
  .replace(/-+$/g, "");

const categoryName = safeText(100).transform((value) => value.replace(/\s+/g, " "));
const description = z.union([safeText(1_000), z.null()]);
const displayOrder = z.number().int().min(0).max(1_000_000);
const explicitSlug = safeText(120)
  .transform(slugifyCategory)
  .refine((value) => value.length > 0, "Enter a slug containing letters or numbers.");

export const adminCategoryParamsSchema = z.object({ id: resourceId }).strict();
export const adminCategoryListQuerySchema = z.object({}).strict();

export const createAdminCategorySchema = z.object({
  name: categoryName,
  description: description.optional(),
  displayOrder: displayOrder.optional(),
  isActive: z.boolean().optional(),
}).strict();

export const updateAdminCategorySchema = z.object({
  name: categoryName.optional(),
  slug: explicitSlug.optional(),
  description: description.optional(),
  displayOrder: displayOrder.optional(),
  isActive: z.boolean().optional(),
}).strict().refine((input) => Object.values(input).some((value) => value !== undefined), {
  message: "Provide at least one category field.",
});

export type CreateAdminCategoryInput = z.infer<typeof createAdminCategorySchema>;
export type UpdateAdminCategoryInput = z.infer<typeof updateAdminCategorySchema>;
