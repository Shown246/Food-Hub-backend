import type { Request, Response } from "express";
import { sendSuccess } from "../../common/responses.js";
import type { ProviderListQuery } from "./provider.schema.js";
import { providerService, type ProviderService } from "./provider.service.js";

export const createProviderController = (service: ProviderService = providerService) => ({
  listPublic: async (request: Request, response: Response): Promise<void> => {
    const result = await service.listPublic(request.query as ProviderListQuery);
    sendSuccess(response, result.providers, { meta: result.meta });
  },

  getPublic: async (request: Request, response: Response): Promise<void> => {
    sendSuccess(response, await service.getPublic(request.params.id as string));
  },
});
