import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

const trustedRequestId = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

export const requestContext: RequestHandler = (request, response, next) => {
  const suppliedId = request.header("x-request-id");
  request.requestId = suppliedId && trustedRequestId.test(suppliedId) ? suppliedId : randomUUID();
  response.setHeader("x-request-id", request.requestId);
  next();
};
