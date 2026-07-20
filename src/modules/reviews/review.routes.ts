import { Router, type RequestHandler } from "express";
import { authenticate, requireRole } from "../../common/middleware/authentication.js";
import { asyncHandler } from "../../common/middleware/async-handler.js";
import { reviewCreationRateLimiter } from "../../common/security/rate-limiters.js";
import { validateRequest } from "../../common/validation/validate-request.js";
import { createReviewController } from "./review.controller.js";
import {
  createReviewSchema,
  reviewListQuerySchema,
  reviewParamsSchema,
  updateReviewSchema,
} from "./review.schema.js";
import { reviewService, type ReviewService } from "./review.service.js";

export const createReviewRouter = (
  service: ReviewService = reviewService,
  authenticateRequest: RequestHandler = authenticate,
): Router => {
  const router = Router();
  const controller = createReviewController(service);
  const customerOnly = [authenticateRequest, requireRole("CUSTOMER")];

  router.get(
    "/meals/:id/reviews",
    validateRequest({ params: reviewParamsSchema, query: reviewListQuerySchema }),
    asyncHandler(controller.list),
  );
  router.post(
    "/reviews",
    reviewCreationRateLimiter(),
    ...customerOnly,
    validateRequest({ body: createReviewSchema }),
    asyncHandler(controller.create),
  );
  router.patch(
    "/reviews/:id",
    ...customerOnly,
    validateRequest({ params: reviewParamsSchema, body: updateReviewSchema }),
    asyncHandler(controller.update),
  );
  router.delete(
    "/reviews/:id",
    ...customerOnly,
    validateRequest({ params: reviewParamsSchema }),
    asyncHandler(controller.remove),
  );
  return router;
};

export const reviewRouter = createReviewRouter();
