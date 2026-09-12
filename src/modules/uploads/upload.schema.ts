import { z } from "zod";

export const ALLOWED_IMAGE_CONTENT_TYPES = [
  "image/webp",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/avif",
] as const;

export type AllowedImageContentType = (typeof ALLOWED_IMAGE_CONTENT_TYPES)[number];

export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

const IMAGE_EXTENSION_REGEX = /\.(webp|jpe?g|png|gif|avif)$/i;

export const presignedUrlSchema = z.object({
  fileName: z.string()
    .trim()
    .min(1, "File name is required.")
    .max(200, "File name cannot exceed 200 characters.")
    .refine((val) => !/[/\\]|\.\./.test(val), "File name must not contain path separators or traversal sequences.")
    .refine((val) => IMAGE_EXTENSION_REGEX.test(val), "File name must have a valid image extension (.jpg, .jpeg, .png, .webp, .gif, .avif)."),
  contentType: z.enum(ALLOWED_IMAGE_CONTENT_TYPES, {
    message: "Invalid image content type. Allowed types: image/jpeg, image/png, image/webp, image/gif, image/avif.",
  }),
  fileSize: z.number({
    error: "File size must be a number.",
  })
    .int("File size must be an integer.")
    .min(1, "File size must be at least 1 byte.")
    .max(MAX_FILE_SIZE_BYTES, "File size must not exceed 5 MB (5,242,880 bytes)."),
  folder: z.enum(["meals"]).optional().default("meals"),
}).strict();

export type PresignedUrlInput = z.infer<typeof presignedUrlSchema>;
