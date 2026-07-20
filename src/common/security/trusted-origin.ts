import type { RequestHandler } from "express";
import { ForbiddenError } from "../errors/app-error.js";

const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);
const sessionCookie = /(?:^|;\s*)(?:__Secure-)?better-auth\.session_token=/;

export const requireTrustedOrigin = (trustedOrigins: readonly string[]): RequestHandler =>
  (request, _response, next) => {
    if (safeMethods.has(request.method) || !sessionCookie.test(request.header("cookie") ?? "")) {
      next();
      return;
    }

    const origin = request.header("origin");
    if (!origin || !trustedOrigins.includes(origin)) {
      next(new ForbiddenError("The request origin is not allowed.", "CSRF_ORIGIN_INVALID"));
      return;
    }
    next();
  };
