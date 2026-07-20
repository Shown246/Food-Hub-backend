import pino, { type Logger } from "pino";
import { config } from "../../config/index.js";

export type SafeLogger = Pick<Logger, "info" | "error">;

export const logger = pino({
  enabled: config.env !== "test",
  level: config.logLevel,
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      "password",
      "passwordHash",
      "token",
      "accessToken",
      "refreshToken",
      "authorization",
      "cookie",
      "deliveryAddress",
      "req.headers.authorization",
      "req.headers.cookie",
      "req.body",
    ],
    censor: "[REDACTED]",
  },
});
