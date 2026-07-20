import { z } from "zod";
import { phoneNumber, resourceId, safeText } from "../../common/validation/schemas.js";

const itemNote = z.string()
  .trim()
  .max(300)
  .refine((value) => !/<\/?[a-z][^>]*>/i.test(value), "HTML content is not allowed")
  .transform((value) => value || undefined)
  .optional();

export const createOrderSchema = z.object({
  items: z.array(z.object({
    mealId: resourceId,
    quantity: z.number().int().min(1).max(20),
    note: itemNote,
  }).strict()).min(1).max(50),
  customerPhone: phoneNumber,
  deliveryAddress: safeText(1_000),
  deliveryInstructions: z.union([safeText(500), z.null()]).optional(),
}).strict();

export const idempotencyKeySchema = z.string()
  .trim()
  .min(1)
  .max(255)
  .regex(/^[A-Za-z0-9._:-]+$/, "Use letters, numbers, dots, underscores, colons, or hyphens.");

export const orderListQuerySchema = z.object({
  status: z.enum(["PLACED", "PREPARING", "READY", "DELIVERED", "CANCELLED"]).optional(),
  sort: z.enum(["newest", "oldest", "total_desc"]).optional(),
  page: z.string().regex(/^\d+$/, "Must be a positive integer.").optional(),
  limit: z.string().regex(/^\d+$/, "Must be a positive integer.").optional(),
}).strict();

export const orderParamsSchema = z.object({ id: resourceId }).strict();
export const cancelOrderSchema = z.object({
  reason: z.union([safeText(500), z.null()]).optional(),
}).strict();

const isoDate = z.string().trim().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime())
    && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || date.toISOString().slice(0, 10) === value);
}, "Enter a valid ISO 8601 date.");

export const providerOrderListQuerySchema = z.object({
  status: z.enum(["PLACED", "PREPARING", "READY", "DELIVERED", "CANCELLED"]).optional(),
  search: safeText(100).optional(),
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
  page: z.string().regex(/^\d+$/, "Must be a positive integer.").optional(),
  limit: z.string().regex(/^\d+$/, "Must be a positive integer.").optional(),
}).strict().superRefine(({ dateFrom, dateTo }, context) => {
  if (dateFrom && dateTo && new Date(dateFrom) > new Date(dateTo)) {
    context.addIssue({ code: "custom", path: ["dateTo"], message: "The end date must not be before the start date." });
  }
});

export const providerOrderStatusSchema = z.object({
  status: z.enum(["PREPARING", "READY", "DELIVERED"]),
}).strict();

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type OrderListQuery = z.infer<typeof orderListQuerySchema>;
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;
export type ProviderOrderListQuery = z.infer<typeof providerOrderListQuerySchema>;
export type ProviderOrderStatusInput = z.infer<typeof providerOrderStatusSchema>;
