import { z } from "zod";
import { httpUrl, positiveMoney, resourceId, safeText } from "../../common/validation/schemas.js";

const booleanQuery = z.enum(["true", "false"]).transform((value) => value === "true");
const nullableHttpUrl = z.union([httpUrl, z.null()]);
const nullablePreparationTime = z.union([z.number().int().min(1).max(1_440), z.null()]);
const dietaryLabels = z.array(safeText(50))
  .max(20)
  .transform((labels) => [...new Set(labels.map((label) => label.toLowerCase()))]);

export const providerMealListQuerySchema = z.object({
  search: safeText(100).optional(),
  categoryId: resourceId.optional(),
  availability: booleanQuery.optional(),
  archived: booleanQuery.optional(),
  page: z.string().regex(/^\d+$/, "Must be a positive integer.").optional(),
  limit: z.string().regex(/^\d+$/, "Must be a positive integer.").optional(),
}).strict();

export const createProviderMealSchema = z.object({
  name: safeText(150),
  description: safeText(5_000),
  price: positiveMoney,
  categoryId: resourceId,
  imageUrl: nullableHttpUrl.optional(),
  dietaryLabels: dietaryLabels.optional(),
  preparationTimeMinutes: nullablePreparationTime.optional(),
  isAvailable: z.boolean().optional(),
}).strict();

export const updateProviderMealSchema = z.object({
  name: safeText(150).optional(),
  description: safeText(5_000).optional(),
  price: positiveMoney.optional(),
  categoryId: resourceId.optional(),
  imageUrl: nullableHttpUrl.optional(),
  dietaryLabels: dietaryLabels.optional(),
  preparationTimeMinutes: nullablePreparationTime.optional(),
  updatedAt: z.iso.datetime({ offset: true }).optional(),
}).strict().refine(
  (input) => Object.keys(input).some((key) => key !== "updatedAt"),
  { message: "At least one editable field is required." },
);

export const providerMealAvailabilitySchema = z.object({ isAvailable: z.boolean() }).strict();
export const providerMealParamsSchema = z.object({ id: resourceId }).strict();

export type ProviderMealListQuery = z.infer<typeof providerMealListQuerySchema>;
export type CreateProviderMealInput = z.infer<typeof createProviderMealSchema>;
export type UpdateProviderMealInput = z.infer<typeof updateProviderMealSchema>;
export type ProviderMealAvailabilityInput = z.infer<typeof providerMealAvailabilitySchema>;
