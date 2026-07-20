import { Router, type RequestHandler } from "express";
import { authenticate, requireRole } from "../../common/middleware/authentication.js";
import { asyncHandler } from "../../common/middleware/async-handler.js";
import { orderCreationRateLimiter } from "../../common/security/rate-limiters.js";
import { validateRequest } from "../../common/validation/validate-request.js";
import { createOrderController } from "./order.controller.js";
import {
  cancelOrderSchema,
  createOrderSchema,
  orderListQuerySchema,
  orderParamsSchema,
  providerOrderListQuerySchema,
  providerOrderStatusSchema,
} from "./order.schema.js";
import { orderService, type OrderService } from "./order.service.js";

export const createOrderRouter = (
  service: OrderService = orderService,
  authenticateRequest: RequestHandler = authenticate,
): Router => {
  const router = Router();
  const controller = createOrderController(service);
  const customerOnly = [authenticateRequest, requireRole("CUSTOMER")];
  const providerOnly = [authenticateRequest, requireRole("PROVIDER")];
  router.post(
    "/orders",
    orderCreationRateLimiter(),
    authenticateRequest,
    requireRole("CUSTOMER"),
    validateRequest({ body: createOrderSchema }),
    asyncHandler(controller.create),
  );
  router.get(
    "/orders",
    ...customerOnly,
    validateRequest({ query: orderListQuerySchema }),
    asyncHandler(controller.listOwn),
  );
  router.get(
    "/orders/:id",
    ...customerOnly,
    validateRequest({ params: orderParamsSchema }),
    asyncHandler(controller.getOwn),
  );
  router.patch(
    "/orders/:id/cancel",
    ...customerOnly,
    validateRequest({ params: orderParamsSchema, body: cancelOrderSchema }),
    asyncHandler(controller.cancelOwn),
  );
  router.get(
    "/provider/orders",
    ...providerOnly,
    validateRequest({ query: providerOrderListQuerySchema }),
    asyncHandler(controller.listProvider),
  );
  router.get(
    "/provider/orders/:id",
    ...providerOnly,
    validateRequest({ params: orderParamsSchema }),
    asyncHandler(controller.getProvider),
  );
  router.patch(
    "/provider/orders/:id/status",
    ...providerOnly,
    validateRequest({ params: orderParamsSchema, body: providerOrderStatusSchema }),
    asyncHandler(controller.updateProviderStatus),
  );
  return router;
};

export const orderRouter = createOrderRouter();
