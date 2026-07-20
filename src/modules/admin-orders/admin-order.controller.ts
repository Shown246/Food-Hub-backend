import type { Request, Response } from "express";
import { sendSuccess } from "../../common/responses.js";
import type { AdminOrderListQuery } from "./admin-order.schema.js";
import type { AdminOrderService } from "./admin-order.service.js";

export const createAdminOrderController = (service: AdminOrderService) => ({
  list: async (request: Request, response: Response): Promise<void> => {
    const result = await service.list(request.query as AdminOrderListQuery);
    sendSuccess(response, result.orders, { meta: result.meta });
  },
  get: async (request: Request, response: Response): Promise<void> => {
    sendSuccess(response, await service.get(request.params.id as string));
  },
});
