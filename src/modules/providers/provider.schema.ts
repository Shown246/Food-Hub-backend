import { z } from "zod";
import { resourceId, safeText } from "../../common/validation/schemas.js";

export const providerListQuerySchema = z.object({
  search: safeText(100).optional(),
  categoryId: resourceId.optional(),
  acceptingOrders: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
  page: z.string().regex(/^\d+$/, "Must be a positive integer.").optional(),
  limit: z.string().regex(/^\d+$/, "Must be a positive integer.").optional(),
}).strict();

export const providerParamsSchema = z.object({ id: resourceId }).strict();

export type ProviderListQuery = z.infer<typeof providerListQuerySchema>;
