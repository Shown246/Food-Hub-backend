import type { Request, Response } from "express";
import { ForbiddenError, UnauthorizedError } from "../../common/errors/app-error.js";
import { sendSuccess } from "../../common/responses.js";
import type { PresignedUrlInput } from "./upload.schema.js";
import { uploadService, type UploadService } from "./upload.service.js";

export const createUploadController = (service: UploadService = uploadService) => ({
  createPresignedUrl: async (request: Request, response: Response): Promise<void> => {
    if (!request.auth) {
      throw new UnauthorizedError();
    }
    if (!request.auth.providerId) {
      throw new ForbiddenError(
        "A valid provider account is required to generate upload URLs.",
        "PROVIDER_REQUIRED",
      );
    }
    const result = await service.createPresignedUrl(
      request.auth.providerId,
      request.body as PresignedUrlInput,
    );
    sendSuccess(response, result);
  },
});
