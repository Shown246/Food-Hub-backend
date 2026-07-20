import type { Request, Response } from "express";
import { sendSuccess } from "../../common/responses.js";
import type { UpdateProfileInput, UpdateProviderProfileInput } from "./profile.schema.js";
import { profileService, type ProfileService } from "./profile.service.js";

export const createProfileController = (service: ProfileService = profileService) => ({
  getOwnProfile: async (request: Request, response: Response): Promise<void> => {
    sendSuccess(response, await service.getOwnProfile(request.auth!.userId));
  },

  updateOwnProfile: async (request: Request, response: Response): Promise<void> => {
    sendSuccess(response, await service.updateOwnProfile(
      request.auth!.userId,
      request.body as UpdateProfileInput,
    ));
  },

  updateOwnProviderProfile: async (request: Request, response: Response): Promise<void> => {
    sendSuccess(response, await service.updateOwnProviderProfile(
      request.auth!.providerId!,
      request.body as UpdateProviderProfileInput,
    ));
  },
});
