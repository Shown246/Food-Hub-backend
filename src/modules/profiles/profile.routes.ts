import { Router, type RequestHandler } from "express";
import { authenticate, requireRole } from "../../common/middleware/authentication.js";
import { asyncHandler } from "../../common/middleware/async-handler.js";
import { validateRequest } from "../../common/validation/validate-request.js";
import { createProfileController } from "./profile.controller.js";
import { updateProfileSchema, updateProviderProfileSchema } from "./profile.schema.js";
import { profileService, type ProfileService } from "./profile.service.js";

export const createProfileRouter = (
  service: ProfileService = profileService,
  authenticateRequest: RequestHandler = authenticate,
): Router => {
  const router = Router();
  const controller = createProfileController(service);

  router.get(
    "/profile",
    authenticateRequest,
    requireRole("CUSTOMER", "PROVIDER"),
    asyncHandler(controller.getOwnProfile),
  );
  router.patch(
    "/profile",
    authenticateRequest,
    requireRole("CUSTOMER", "PROVIDER"),
    validateRequest({ body: updateProfileSchema }),
    asyncHandler(controller.updateOwnProfile),
  );
  router.patch(
    "/provider/profile",
    authenticateRequest,
    requireRole("PROVIDER"),
    validateRequest({ body: updateProviderProfileSchema }),
    asyncHandler(controller.updateOwnProviderProfile),
  );
  return router;
};

export const profileRouter = createProfileRouter();
