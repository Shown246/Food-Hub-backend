import { z } from "zod";

const htmlTag = /<\/?[a-z][^>]*>/i;

export const safeText = (maximum: number, minimum = 1) => z.string()
  .trim()
  .min(minimum)
  .max(maximum)
  .refine((value) => !htmlTag.test(value), "HTML content is not allowed");

export const optionalSafeText = (maximum: number) => z.string()
  .trim()
  .max(maximum)
  .refine((value) => !htmlTag.test(value), "HTML content is not allowed")
  .optional();

export const normalizedEmail = z.string()
  .trim()
  .toLowerCase()
  .email()
  .max(254);

export const phoneNumber = safeText(30, 7).regex(
  /^\+?[0-9][0-9 ()-]{5,28}[0-9]$/,
  "Enter a valid phone number.",
);

export const resourceId = z.string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "Invalid identifier");

export const httpUrl = z.string().trim().url().max(2_048).refine((value) => {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}, "URL must use HTTP or HTTPS");

export const positiveMoney = z.string()
  .trim()
  .regex(/^\d{1,10}(?:\.\d{1,2})?$/, "Enter a valid monetary amount")
  .refine((value) => Number(value) > 0, "Amount must be greater than zero");
