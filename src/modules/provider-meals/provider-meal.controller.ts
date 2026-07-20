import type { Request, Response } from "express";
import { UnauthorizedError } from "../../common/errors/app-error.js";
import { sendSuccess } from "../../common/responses.js";
import type {
  CreateProviderMealInput,
  ProviderMealAvailabilityInput,
  ProviderMealListQuery,
  UpdateProviderMealInput,
} from "./provider-meal.schema.js";
import { providerMealService, type ProviderMealService } from "./provider-meal.service.js";

const providerIdentity = (request: Request) => {
  if (!request.auth?.providerId) throw new UnauthorizedError();
  return { providerId: request.auth.providerId, userId: request.auth.userId };
};

export const createProviderMealController = (service: ProviderMealService = providerMealService) => ({
  listOwn: async (request: Request, response: Response): Promise<void> => {
    const { providerId } = providerIdentity(request);
    const result = await service.listOwn(providerId, request.query as ProviderMealListQuery);
    sendSuccess(response, result.meals, { meta: result.meta });
  },
  create: async (request: Request, response: Response): Promise<void> => {
    const { providerId } = providerIdentity(request);
    sendSuccess(response, await service.create(providerId, request.body as CreateProviderMealInput), { status: 201 });
  },
  update: async (request: Request, response: Response): Promise<void> => {
    const { providerId } = providerIdentity(request);
    sendSuccess(response, await service.update(providerId, request.params.id as string, request.body as UpdateProviderMealInput));
  },
  setAvailability: async (request: Request, response: Response): Promise<void> => {
    const { providerId } = providerIdentity(request);
    sendSuccess(response, await service.setAvailability(
      providerId,
      request.params.id as string,
      request.body as ProviderMealAvailabilityInput,
    ));
  },
  archive: async (request: Request, response: Response): Promise<void> => {
    const { providerId, userId } = providerIdentity(request);
    sendSuccess(response, await service.archive(providerId, request.params.id as string, userId, request.requestId));
  },
  restore: async (request: Request, response: Response): Promise<void> => {
    const { providerId, userId } = providerIdentity(request);
    sendSuccess(response, await service.restore(providerId, request.params.id as string, userId, request.requestId));
  },
});
