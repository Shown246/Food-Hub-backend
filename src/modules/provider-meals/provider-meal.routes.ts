import { Router, type RequestHandler } from "express";
import { authenticate, requireRole } from "../../common/middleware/authentication.js";
import { asyncHandler } from "../../common/middleware/async-handler.js";
import { validateRequest } from "../../common/validation/validate-request.js";
import { createProviderMealController } from "./provider-meal.controller.js";
import {
  createProviderMealSchema,
  providerMealAvailabilitySchema,
  providerMealListQuerySchema,
  providerMealParamsSchema,
  updateProviderMealSchema,
} from "./provider-meal.schema.js";
import { providerMealService, type ProviderMealService } from "./provider-meal.service.js";

export const createProviderMealRouter = (
  service: ProviderMealService = providerMealService,
  authenticateRequest: RequestHandler = authenticate,
): Router => {
  const router = Router();
  const controller = createProviderMealController(service);
  const providerOnly = [authenticateRequest, requireRole("PROVIDER")];

  router.get("/provider/meals", ...providerOnly, validateRequest({ query: providerMealListQuerySchema }), asyncHandler(controller.listOwn));
  router.post("/provider/meals", ...providerOnly, validateRequest({ body: createProviderMealSchema }), asyncHandler(controller.create));
  router.patch("/provider/meals/:id", ...providerOnly, validateRequest({ params: providerMealParamsSchema, body: updateProviderMealSchema }), asyncHandler(controller.update));
  router.patch("/provider/meals/:id/availability", ...providerOnly, validateRequest({ params: providerMealParamsSchema, body: providerMealAvailabilitySchema }), asyncHandler(controller.setAvailability));
  router.delete("/provider/meals/:id", ...providerOnly, validateRequest({ params: providerMealParamsSchema }), asyncHandler(controller.archive));
  router.patch("/provider/meals/:id/restore", ...providerOnly, validateRequest({ params: providerMealParamsSchema }), asyncHandler(controller.restore));
  return router;
};

export const providerMealRouter = createProviderMealRouter();
