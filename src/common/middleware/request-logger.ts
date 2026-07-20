import { performance } from "node:perf_hooks";
import type { RequestHandler } from "express";
import type { SafeLogger } from "../logging/logger.js";

export const createRequestLogger = (logger: SafeLogger): RequestHandler => (request, response, next) => {
  const startedAt = performance.now();

  response.once("finish", () => {
    logger.info({
      requestId: request.requestId,
      method: request.method,
      route: request.route?.path ?? request.path,
      status: response.statusCode,
      durationMs: Number((performance.now() - startedAt).toFixed(2)),
      ...(request.auth ? { userId: request.auth.userId } : {}),
      ...(response.locals.errorCode ? { errorCode: response.locals.errorCode as string } : {}),
    }, "request completed");
  });

  next();
};
