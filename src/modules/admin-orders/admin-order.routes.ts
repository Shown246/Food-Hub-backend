import { Router, type RequestHandler } from "express";
import { authenticate, requireRole } from "../../common/middleware/authentication.js";
import { asyncHandler } from "../../common/middleware/async-handler.js";
import { validateRequest } from "../../common/validation/validate-request.js";
import { createAdminOrderController } from "./admin-order.controller.js";
import { adminOrderListQuerySchema, adminOrderParamsSchema } from "./admin-order.schema.js";
import { adminOrderService, type AdminOrderService } from "./admin-order.service.js";

export const createAdminOrderRouter = (
  service: AdminOrderService = adminOrderService,
  authenticateRequest: RequestHandler = authenticate,
): Router => {
  const router = Router();
  const controller = createAdminOrderController(service);
  const adminOnly = [authenticateRequest, requireRole("ADMIN")];
  router.get(
    "/admin/orders",
    ...adminOnly,
    validateRequest({ query: adminOrderListQuerySchema }),
    asyncHandler(controller.list),
  );
  router.get(
    "/admin/orders/:id",
    ...adminOnly,
    validateRequest({ params: adminOrderParamsSchema }),
    asyncHandler(controller.get),
  );
  return router;
};

export const adminOrderRouter = createAdminOrderRouter();
