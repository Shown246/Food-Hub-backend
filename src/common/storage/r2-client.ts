import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "../../config/index.js";

export interface PresignedUploadUrlOptions {
  key: string;
  contentType: string;
  contentLength: number;
  expiresIn?: number;
}

export const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${config.storage.accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: config.storage.accessKeyId,
    secretAccessKey: config.storage.secretAccessKey,
  },
});

export const createPresignedUploadUrl = async (
  options: PresignedUploadUrlOptions,
  client: S3Client = s3Client,
  bucketName: string = config.storage.bucketName,
): Promise<string> => {
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: options.key,
    ContentType: options.contentType,
    ContentLength: options.contentLength,
    CacheControl: "public, max-age=31536000, immutable",
  });

  return getSignedUrl(client, command, {
    expiresIn: options.expiresIn ?? 300,
  });
};

export const deleteStorageObject = async (
  key: string,
  client: S3Client = s3Client,
  bucketName: string = config.storage.bucketName,
): Promise<void> => {
  const command = new DeleteObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  await client.send(command);
};
