import type { Response } from "express";
import type { ErrorFields } from "./errors/app-error.js";

export interface PaginationMeta {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface ErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
    requestId: string;
    fields?: ErrorFields;
  };
}

export const sendSuccess = <T>(
  response: Response,
  data: T,
  options: { status?: number; meta?: Record<string, unknown> | PaginationMeta } = {},
): Response => {
  const body: { success: true; data: T; meta?: Record<string, unknown> | PaginationMeta } = {
    success: true,
    data,
  };
  if (options.meta) body.meta = options.meta;
  return response.status(options.status ?? 200).json(body);
};

export const errorEnvelope = (
  requestId: string,
  code: string,
  message: string,
  fields?: ErrorFields,
): ErrorEnvelope => ({
  success: false,
  error: {
    code,
    message,
    requestId,
    ...(fields ? { fields } : {}),
  },
});
