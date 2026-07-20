import { Router, type RequestHandler } from "express";
import { authenticate, requireRole } from "../../common/middleware/authentication.js";
import { asyncHandler } from "../../common/middleware/async-handler.js";
import { validateRequest } from "../../common/validation/validate-request.js";
import { createDashboardController } from "./dashboard.controller.js";
import { dashboardQuerySchema } from "./dashboard.schema.js";
import { dashboardService, type DashboardService } from "./dashboard.service.js";

export const createDashboardRouter = (
  service: DashboardService = dashboardService,
  authenticateRequest: RequestHandler = authenticate,
): Router => {
  const router = Router();
  const controller = createDashboardController(service);
  router.get(
    "/provider/dashboard",
    authenticateRequest,
    requireRole("PROVIDER"),
    validateRequest({ query: dashboardQuerySchema }),
    asyncHandler(controller.provider),
  );
  router.get(
    "/admin/dashboard",
    authenticateRequest,
    requireRole("ADMIN"),
    validateRequest({ query: dashboardQuerySchema }),
    asyncHandler(controller.admin),
  );
  return router;
};

export const dashboardRouter = createDashboardRouter();
