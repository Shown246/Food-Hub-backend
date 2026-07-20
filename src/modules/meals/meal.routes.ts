import { Router, type RequestHandler } from "express";
import { asyncHandler } from "../../common/middleware/async-handler.js";
import { publicSearchRateLimiter } from "../../common/security/rate-limiters.js";
import { validateRequest } from "../../common/validation/validate-request.js";
import { createMealController } from "./meal.controller.js";
import { mealListQuerySchema, mealParamsSchema } from "./meal.schema.js";
import { mealService, type MealService } from "./meal.service.js";

export const createMealRouter = (
  service: MealService = mealService,
  searchRateLimiter: RequestHandler = publicSearchRateLimiter(),
): Router => {
  const router = Router();
  const controller = createMealController(service);
  router.get(
    "/meals",
    searchRateLimiter,
    validateRequest({ query: mealListQuerySchema }),
    asyncHandler(controller.listOrderable),
  );
  router.get(
    "/meals/:id",
    validateRequest({ params: mealParamsSchema }),
    asyncHandler(controller.getOrderable),
  );
  return router;
};

export const mealRouter = createMealRouter();
