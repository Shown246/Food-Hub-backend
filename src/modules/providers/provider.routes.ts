import { Router, type RequestHandler } from "express";
import { asyncHandler } from "../../common/middleware/async-handler.js";
import { publicSearchRateLimiter } from "../../common/security/rate-limiters.js";
import { validateRequest } from "../../common/validation/validate-request.js";
import { createProviderController } from "./provider.controller.js";
import { providerListQuerySchema, providerParamsSchema } from "./provider.schema.js";
import { providerService, type ProviderService } from "./provider.service.js";

export const createProviderRouter = (
  service: ProviderService = providerService,
  searchRateLimiter: RequestHandler = publicSearchRateLimiter(),
): Router => {
  const router = Router();
  const controller = createProviderController(service);
  router.get(
    "/providers",
    searchRateLimiter,
    validateRequest({ query: providerListQuerySchema }),
    asyncHandler(controller.listPublic),
  );
  router.get(
    "/providers/:id",
    validateRequest({ params: providerParamsSchema }),
    asyncHandler(controller.getPublic),
  );
  return router;
};

export const providerRouter = createProviderRouter();
