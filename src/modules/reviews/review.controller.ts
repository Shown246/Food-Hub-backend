import type { Request, Response } from "express";
import { UnauthorizedError } from "../../common/errors/app-error.js";
import { sendSuccess } from "../../common/responses.js";
import type { CreateReviewInput, ReviewListQuery, UpdateReviewInput } from "./review.schema.js";
import type { ReviewService } from "./review.service.js";

export const createReviewController = (service: ReviewService) => ({
  list: async (request: Request, response: Response): Promise<void> => {
    const result = await service.listForPublicMeal(request.params.id as string, request.query as ReviewListQuery);
    sendSuccess(response, result.reviews, { meta: result.meta });
  },
  create: async (request: Request, response: Response): Promise<void> => {
    if (!request.auth) throw new UnauthorizedError();
    sendSuccess(response, await service.create(request.auth.userId, request.body as CreateReviewInput), { status: 201 });
  },
  update: async (request: Request, response: Response): Promise<void> => {
    if (!request.auth) throw new UnauthorizedError();
    sendSuccess(response, await service.update(
      request.auth.userId,
      request.params.id as string,
      request.body as UpdateReviewInput,
    ));
  },
  remove: async (request: Request, response: Response): Promise<void> => {
    if (!request.auth) throw new UnauthorizedError();
    sendSuccess(response, await service.remove(request.auth.userId, request.params.id as string));
  },
});
