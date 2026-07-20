import type { ErrorRequestHandler, RequestHandler } from "express";
import { AppError, BadRequestError, ConflictError, NotFoundError } from "../errors/app-error.js";
import type { SafeLogger } from "../logging/logger.js";
import { errorEnvelope } from "../responses.js";

const isPrismaError = (error: unknown): error is { code: string } =>
  typeof error === "object" && error !== null && "code" in error && typeof error.code === "string";

const normalizeError = (error: unknown): AppError => {
  if (error instanceof AppError) return error;

  if (error instanceof SyntaxError && "body" in error) {
    return new BadRequestError("The request body contains malformed JSON.", "MALFORMED_JSON");
  }

  if (typeof error === "object" && error !== null && "type" in error && error.type === "entity.too.large") {
    return new AppError(413, "PAYLOAD_TOO_LARGE", "The request body is too large.");
  }

  if (isPrismaError(error)) {
    if (error.code === "P2002") return new ConflictError("A resource with those values already exists.", "DUPLICATE_RESOURCE");
    if (error.code === "P2025") return new NotFoundError();
    if (error.code === "P2003") return new ConflictError("The resource is still referenced and cannot be changed.", "RESOURCE_REFERENCED");
  }

  return new AppError(500, "INTERNAL_ERROR", "An unexpected error occurred.");
};

export const notFoundHandler: RequestHandler = (_request, _response, next) => {
  next(new NotFoundError("The requested API route was not found.", "ROUTE_NOT_FOUND"));
};

export const createErrorHandler = (logger: SafeLogger): ErrorRequestHandler =>
  (error: unknown, request, response, next) => {
    if (response.headersSent) {
      next(error);
      return;
    }

    const normalized = normalizeError(error);
    response.locals.errorCode = normalized.code;

    if (normalized.statusCode >= 500) {
      logger.error({
        requestId: request.requestId,
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorCode: isPrismaError(error) ? error.code : normalized.code,
      }, "request failed unexpectedly");
    }

    response
      .status(normalized.statusCode)
      .json(errorEnvelope(request.requestId, normalized.code, normalized.message, normalized.fields));
  };
