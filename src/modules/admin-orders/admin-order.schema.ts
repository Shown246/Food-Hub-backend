import { z } from "zod";
import { resourceId, safeText } from "../../common/validation/schemas.js";

const isoDate = z.string().trim().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime())
    && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || date.toISOString().slice(0, 10) === value);
}, "Enter a valid ISO 8601 date.");

export const adminOrderParamsSchema = z.object({ id: resourceId }).strict();

export const adminOrderListQuerySchema = z.object({
  search: safeText(100).optional(),
  status: z.enum(["PLACED", "PREPARING", "READY", "DELIVERED", "CANCELLED"]).optional(),
  customerId: resourceId.optional(),
  providerId: resourceId.optional(),
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
  page: z.string().regex(/^\d+$/, "Must be a positive integer.").optional(),
  limit: z.string().regex(/^\d+$/, "Must be a positive integer.").optional(),
}).strict().superRefine(({ dateFrom, dateTo }, context) => {
  if (dateFrom && dateTo && new Date(dateFrom) > new Date(dateTo)) {
    context.addIssue({ code: "custom", path: ["dateTo"], message: "The end date must not be before the start date." });
  }
});

export type AdminOrderListQuery = z.infer<typeof adminOrderListQuerySchema>;
