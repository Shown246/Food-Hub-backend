import { Router, type RequestHandler } from "express";
import { authenticate, requireRole } from "../../common/middleware/authentication.js";
import { asyncHandler } from "../../common/middleware/async-handler.js";
import { validateRequest } from "../../common/validation/validate-request.js";
import { createAdminUserController } from "./admin-user.controller.js";
import {
  adminUserListQuerySchema,
  adminUserParamsSchema,
  adminUserStatusSchema,
} from "./admin-user.schema.js";
import { adminUserService, type AdminUserService } from "./admin-user.service.js";

export const createAdminUserRouter = (
  service: AdminUserService = adminUserService,
  authenticateRequest: RequestHandler = authenticate,
): Router => {
  const router = Router();
  const controller = createAdminUserController(service);
  const adminOnly = [authenticateRequest, requireRole("ADMIN")];
  router.get(
    "/admin/users",
    ...adminOnly,
    validateRequest({ query: adminUserListQuerySchema }),
    asyncHandler(controller.list),
  );
  router.get(
    "/admin/users/:id",
    ...adminOnly,
    validateRequest({ params: adminUserParamsSchema }),
    asyncHandler(controller.get),
  );
  router.patch(
    "/admin/users/:id/status",
    ...adminOnly,
    validateRequest({ params: adminUserParamsSchema, body: adminUserStatusSchema }),
    asyncHandler(controller.updateStatus),
  );
  return router;
};

export const adminUserRouter = createAdminUserRouter();
