import { Router, type RequestHandler } from "express";
import { authenticate, requireRole } from "../../common/middleware/authentication.js";
import { asyncHandler } from "../../common/middleware/async-handler.js";
import { validateRequest } from "../../common/validation/validate-request.js";
import { createAdminCategoryController } from "./admin-category.controller.js";
import {
  adminCategoryListQuerySchema,
  adminCategoryParamsSchema,
  createAdminCategorySchema,
  updateAdminCategorySchema,
} from "./admin-category.schema.js";
import { adminCategoryService, type AdminCategoryService } from "./admin-category.service.js";

export const createAdminCategoryRouter = (
  service: AdminCategoryService = adminCategoryService,
  authenticateRequest: RequestHandler = authenticate,
): Router => {
  const router = Router();
  const controller = createAdminCategoryController(service);
  const adminOnly = [authenticateRequest, requireRole("ADMIN")];
  router.get(
    "/admin/categories",
    ...adminOnly,
    validateRequest({ query: adminCategoryListQuerySchema }),
    asyncHandler(controller.list),
  );
  router.post(
    "/admin/categories",
    ...adminOnly,
    validateRequest({ body: createAdminCategorySchema }),
    asyncHandler(controller.create),
  );
  router.patch(
    "/admin/categories/:id",
    ...adminOnly,
    validateRequest({ params: adminCategoryParamsSchema, body: updateAdminCategorySchema }),
    asyncHandler(controller.update),
  );
  router.delete(
    "/admin/categories/:id",
    ...adminOnly,
    validateRequest({ params: adminCategoryParamsSchema }),
    asyncHandler(controller.remove),
  );
  return router;
};

export const adminCategoryRouter = createAdminCategoryRouter();
