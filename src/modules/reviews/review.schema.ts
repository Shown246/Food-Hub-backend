import { z } from "zod";
import { resourceId, safeText } from "../../common/validation/schemas.js";

const rating = z.number().int().min(1).max(5);
const comment = z.union([safeText(2_000), z.null()]);

export const reviewParamsSchema = z.object({ id: resourceId }).strict();

export const reviewListQuerySchema = z.object({
  sort: z.enum(["newest", "oldest", "rating_desc", "rating_asc"]).optional(),
  page: z.string().regex(/^\d+$/, "Must be a positive integer.").optional(),
  limit: z.string().regex(/^\d+$/, "Must be a positive integer.").optional(),
}).strict();

export const createReviewSchema = z.object({
  orderId: resourceId,
  mealId: resourceId,
  rating,
  comment: comment.optional(),
}).strict();

export const updateReviewSchema = z.object({
  rating: rating.optional(),
  comment: comment.optional(),
}).strict().refine(
  ({ rating: nextRating, comment: nextComment }) => nextRating !== undefined || nextComment !== undefined,
  { message: "Provide a rating or comment." },
);

export type ReviewListQuery = z.infer<typeof reviewListQuerySchema>;
export type CreateReviewInput = z.infer<typeof createReviewSchema>;
export type UpdateReviewInput = z.infer<typeof updateReviewSchema>;
