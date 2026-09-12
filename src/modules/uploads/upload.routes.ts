import { Router, type RequestHandler } from "express";
import { authenticate, requireRole } from "../../common/middleware/authentication.js";
import { asyncHandler } from "../../common/middleware/async-handler.js";
import { validateRequest } from "../../common/validation/validate-request.js";
import { createUploadController } from "./upload.controller.js";
import { presignedUrlSchema } from "./upload.schema.js";
import { uploadService, type UploadService } from "./upload.service.js";

export const createUploadRouter = (
  service: UploadService = uploadService,
  authenticateRequest: RequestHandler = authenticate,
): Router => {
  const router = Router();
  const controller = createUploadController(service);
  const providerOnly = [authenticateRequest, requireRole("PROVIDER")];

  router.post(
    "/uploads/presigned-url",
    ...providerOnly,
    validateRequest({ body: presignedUrlSchema }),
    asyncHandler(controller.createPresignedUrl),
  );

  return router;
};

export const uploadRouter = createUploadRouter();
