import type { Request, Response } from "express";
import { UnauthorizedError, ValidationError } from "../../common/errors/app-error.js";
import { sendSuccess } from "../../common/responses.js";
import {
  idempotencyKeySchema,
  type CancelOrderInput,
  type CreateOrderInput,
  type OrderListQuery,
  type ProviderOrderListQuery,
  type ProviderOrderStatusInput,
} from "./order.schema.js";
import { orderService, type OrderService } from "./order.service.js";

export const createOrderController = (service: OrderService = orderService) => ({
  create: async (request: Request, response: Response): Promise<void> => {
    if (!request.auth) throw new UnauthorizedError();
    const rawKey = request.get("Idempotency-Key");
    const parsedKey = rawKey === undefined ? undefined : idempotencyKeySchema.safeParse(rawKey);
    if (parsedKey && !parsedKey.success) {
      throw new ValidationError({ idempotencyKey: parsedKey.error.issues[0]?.message ?? "Invalid idempotency key." });
    }
    const result = await service.create(
      request.auth.userId,
      request.body as CreateOrderInput,
      parsedKey?.data,
    );
    if (result.replayed) response.setHeader("Idempotency-Replayed", "true");
    sendSuccess(response, result.order, { status: result.replayed ? 200 : 201 });
  },
  listOwn: async (request: Request, response: Response): Promise<void> => {
    if (!request.auth) throw new UnauthorizedError();
    const result = await service.listOwn(request.auth.userId, request.query as OrderListQuery);
    sendSuccess(response, result.orders, { meta: result.meta });
  },
  getOwn: async (request: Request, response: Response): Promise<void> => {
    if (!request.auth) throw new UnauthorizedError();
    sendSuccess(response, await service.getOwn(request.auth.userId, request.params.id as string));
  },
  cancelOwn: async (request: Request, response: Response): Promise<void> => {
    if (!request.auth) throw new UnauthorizedError();
    sendSuccess(response, await service.cancelOwn(
      request.auth.userId,
      request.params.id as string,
      request.body as CancelOrderInput,
      request.requestId,
    ));
  },
  listProvider: async (request: Request, response: Response): Promise<void> => {
    if (!request.auth?.providerId) throw new UnauthorizedError();
    const result = await service.listProvider(request.auth.providerId, request.query as ProviderOrderListQuery);
    sendSuccess(response, result.orders, { meta: result.meta });
  },
  getProvider: async (request: Request, response: Response): Promise<void> => {
    if (!request.auth?.providerId) throw new UnauthorizedError();
    sendSuccess(response, await service.getProvider(request.auth.providerId, request.params.id as string));
  },
  updateProviderStatus: async (request: Request, response: Response): Promise<void> => {
    if (!request.auth?.providerId) throw new UnauthorizedError();
    sendSuccess(response, await service.updateProviderStatus(
      request.auth.providerId,
      request.auth.userId,
      request.params.id as string,
      request.body as ProviderOrderStatusInput,
      request.requestId,
    ));
  },
});
