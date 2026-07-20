import { z } from "zod";
import { httpUrl, phoneNumber, safeText } from "../../common/validation/schemas.js";

const atLeastOneField = <T extends z.ZodRawShape>(shape: T) => z.object(shape)
  .strict()
  .refine(
    (value) => Object.values(value).some((field) => field !== undefined),
    { message: "At least one field must be provided." },
  );

export const updateProfileSchema = atLeastOneField({
  fullName: safeText(100).optional(),
  phone: phoneNumber.nullable().optional(),
  defaultDeliveryAddress: safeText(1_000).nullable().optional(),
  profileImageUrl: httpUrl.nullable().optional(),
});

export const updateProviderProfileSchema = atLeastOneField({
  name: safeText(150).optional(),
  description: safeText(3_000).optional(),
  address: safeText(1_000).optional(),
  phone: phoneNumber.optional(),
  logoUrl: httpUrl.nullable().optional(),
  openingHours: safeText(1_000).nullable().optional(),
  acceptingOrders: z.boolean().optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type UpdateProviderProfileInput = z.infer<typeof updateProviderProfileSchema>;
