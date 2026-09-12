import crypto from "node:crypto";
import { ForbiddenError } from "../../common/errors/app-error.js";
import { createPresignedUploadUrl } from "../../common/storage/r2-client.js";
import { config } from "../../config/index.js";
import type { PresignedUrlInput } from "./upload.schema.js";

export interface PresignedUrlResult {
  uploadUrl: string;
  publicUrl: string;
  key: string;
}

export interface UploadServiceDependencies {
  storageConfig?: {
    publicUrl: string;
    bucketName: string;
  };
  presignUpload?: typeof createPresignedUploadUrl;
}

export const sanitizeFileName = (fileName: string): string => {
  const base = fileName.split(/[/\\]/).pop() ?? "image";
  const lastDot = base.lastIndexOf(".");
  const name = lastDot !== -1 ? base.slice(0, lastDot) : base;
  const ext = lastDot !== -1 ? base.slice(lastDot + 1).toLowerCase() : "jpg";

  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "image";

  const cleanExt = ext.replace(/[^a-z0-9]/g, "");
  return `${slug}.${cleanExt}`;
};

export const generateStorageKey = (
  folder: string,
  providerId: string,
  fileName: string,
): string => {
  const sanitized = sanitizeFileName(fileName);
  const randomSuffix = crypto.randomBytes(6).toString("hex");
  const timestamp = Date.now();
  return `${folder}/${providerId}/${timestamp}-${randomSuffix}-${sanitized}`;
};

export const createUploadService = (dependencies: UploadServiceDependencies = {}) => {
  const getStorageConfig = () => dependencies.storageConfig ?? config.storage;
  const presignUpload = dependencies.presignUpload ?? createPresignedUploadUrl;

  return {
    createPresignedUrl: async (
      providerId: string | null | undefined,
      input: PresignedUrlInput,
    ): Promise<PresignedUrlResult> => {
      if (!providerId) {
        throw new ForbiddenError(
          "A valid provider account is required to generate upload URLs.",
          "PROVIDER_REQUIRED",
        );
      }

      const storage = getStorageConfig();
      const folder = input.folder || "meals";
      const key = generateStorageKey(folder, providerId, input.fileName);

      const uploadUrl = await presignUpload({
        key,
        contentType: input.contentType,
        contentLength: input.fileSize,
        expiresIn: 300,
      });

      const publicBase = storage.publicUrl.replace(/\/$/, "");
      const publicUrl = `${publicBase}/${key}`;

      return {
        uploadUrl,
        publicUrl,
        key,
      };
    },
  };
};

export type UploadService = ReturnType<typeof createUploadService>;
export const uploadService = createUploadService();
