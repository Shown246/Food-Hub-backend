import type { RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import { config } from "../../config/index.js";
import { AppError } from "../errors/app-error.js";

interface RateLimiterOptions {
  windowMs: number;
  max: number;
  code: string;
}

export const createRateLimiter = ({ windowMs, max, code }: RateLimiterOptions): RequestHandler => rateLimit({
  windowMs,
  limit: max,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: () => config.env === "test" && process.env.ENABLE_RATE_LIMITS_IN_TESTS !== "true",
  handler: (_request, _response, next) => {
    next(new AppError(429, code, "Too many requests. Please try again later."));
  },
});

export const authRateLimiter = (): RequestHandler => createRateLimiter({
  windowMs: config.rateLimits.windowMs,
  max: config.rateLimits.auth,
  code: "AUTH_RATE_LIMITED",
});

export const orderCreationRateLimiter = (): RequestHandler => createRateLimiter({
  windowMs: config.rateLimits.windowMs,
  max: config.rateLimits.orderCreation,
  code: "ORDER_RATE_LIMITED",
});

export const reviewCreationRateLimiter = (): RequestHandler => createRateLimiter({
  windowMs: config.rateLimits.windowMs,
  max: config.rateLimits.reviewCreation,
  code: "REVIEW_RATE_LIMITED",
});

export const publicSearchRateLimiter = (): RequestHandler => createRateLimiter({
  windowMs: config.rateLimits.windowMs,
  max: config.rateLimits.publicSearch,
  code: "SEARCH_RATE_LIMITED",
});
