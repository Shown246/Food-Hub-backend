import { z } from "zod";
import { normalizedEmail, phoneNumber, safeText } from "../../common/validation/schemas.js";

export const password = z.string()
  .min(8, "Password must contain at least 8 characters.")
  .max(128, "Password must contain at most 128 characters.")
  .regex(/[a-z]/, "Password must contain a lowercase letter.")
  .regex(/[A-Z]/, "Password must contain an uppercase letter.")
  .regex(/[0-9]/, "Password must contain a number.");

const commonRegistration = {
  fullName: safeText(100),
  email: normalizedEmail,
  phone: phoneNumber,
  password,
};

const customerRegistrationSchema = z.object({
  ...commonRegistration,
  role: z.literal("CUSTOMER"),
}).strict();

const providerRegistrationSchema = z.object({
  ...commonRegistration,
  role: z.literal("PROVIDER"),
  providerName: safeText(150),
  providerDescription: safeText(3_000),
  providerAddress: safeText(1_000),
  providerPhone: phoneNumber,
}).strict();

export const registerSchema = z.discriminatedUnion("role", [
  customerRegistrationSchema,
  providerRegistrationSchema,
]);

export const loginSchema = z.object({
  email: normalizedEmail,
  password: z.string().min(1).max(128),
}).strict();

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: password,
}).strict().refine(
  ({ currentPassword, newPassword }) => currentPassword !== newPassword,
  { path: ["newPassword"], message: "The new password must be different from the current password." },
);

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
