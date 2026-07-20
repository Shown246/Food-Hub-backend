type RuntimeEnvironment = "development" | "test" | "production";
type SameSite = "lax" | "strict" | "none";

export interface AppConfig {
  env: RuntimeEnvironment;
  port: number;
  databaseUrl: string;
  databasePoolMax: number;
  auth: {
    secret: string;
    baseUrl: string;
  };
  corsOrigins: string[];
  cookie: {
    secure: boolean;
    sameSite: SameSite;
  };
  trustProxy: boolean;
  maxBodyBytes: number;
  logLevel: "debug" | "info" | "warn" | "error";
  openApiDocsEnabled: boolean;
  rateLimits: {
    windowMs: number;
    auth: number;
    orderCreation: number;
    reviewCreation: number;
    publicSearch: number;
  };
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(`Invalid application configuration: ${message}`);
    this.name = "ConfigError";
  }
}

const required = (env: NodeJS.ProcessEnv, name: string): string => {
  const value = env[name]?.trim();
  if (!value) {
    throw new ConfigError(`${name} is required`);
  }
  return value;
};

const parseBoolean = (value: string | undefined, fallback: boolean, name: string): boolean => {
  if (value === undefined || value.trim() === "") return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new ConfigError(`${name} must be either true or false`);
};

const parseInteger = (
  value: string | undefined,
  fallback: number,
  name: string,
  minimum: number,
  maximum: number,
): number => {
  const parsed = Number(value?.trim() || fallback);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new ConfigError(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return parsed;
};

const parseUrl = (value: string, name: string, protocols: string[]): URL => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ConfigError(`${name} must be a valid URL`);
  }

  if (!protocols.includes(url.protocol)) {
    throw new ConfigError(`${name} must use one of: ${protocols.join(", ")}`);
  }
  return url;
};

const parseOrigin = (value: string): string => {
  const url = parseUrl(value, "CORS_ORIGINS", ["http:", "https:"]);
  if (url.origin !== value.replace(/\/$/, "")) {
    throw new ConfigError("CORS_ORIGINS entries must be origins without paths, queries, or fragments");
  }
  return url.origin;
};

export const loadConfig = (env: NodeJS.ProcessEnv): AppConfig => {
  const runtimeEnv = env.NODE_ENV?.trim() || "development";
  if (!(["development", "test", "production"] as string[]).includes(runtimeEnv)) {
    throw new ConfigError("NODE_ENV must be development, test, or production");
  }

  const portText = env.PORT?.trim() || "3000";
  const port = Number(portText);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new ConfigError("PORT must be an integer between 1 and 65535");
  }

  const databaseUrl = required(env, "DATABASE_URL");
  parseUrl(databaseUrl, "DATABASE_URL", ["postgres:", "postgresql:"]);

  const secret = required(env, "BETTER_AUTH_SECRET");
  if (secret.length < 32) {
    throw new ConfigError("BETTER_AUTH_SECRET must contain at least 32 characters");
  }

  const baseUrl = required(env, "BETTER_AUTH_URL");
  parseUrl(baseUrl, "BETTER_AUTH_URL", ["http:", "https:"]);

  const defaultOrigins = runtimeEnv === "production" ? "" : "http://localhost:4000";
  const corsOrigins = (env.CORS_ORIGINS ?? defaultOrigins)
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map(parseOrigin);
  if (corsOrigins.length === 0) {
    throw new ConfigError("CORS_ORIGINS must contain at least one allowed origin");
  }

  const secure = parseBoolean(env.COOKIE_SECURE, runtimeEnv === "production", "COOKIE_SECURE");
  const sameSite = (env.COOKIE_SAME_SITE?.trim() || "lax") as SameSite;
  if (!(["lax", "strict", "none"] as string[]).includes(sameSite)) {
    throw new ConfigError("COOKIE_SAME_SITE must be lax, strict, or none");
  }
  if (sameSite === "none" && !secure) {
    throw new ConfigError("COOKIE_SECURE must be true when COOKIE_SAME_SITE is none");
  }
  if (runtimeEnv === "production" && !secure) {
    throw new ConfigError("COOKIE_SECURE cannot be false in production");
  }

  const logLevel = env.LOG_LEVEL?.trim() || (runtimeEnv === "test" ? "error" : "info");
  if (!(["debug", "info", "warn", "error"] as string[]).includes(logLevel)) {
    throw new ConfigError("LOG_LEVEL must be debug, info, warn, or error");
  }

  return {
    env: runtimeEnv as RuntimeEnvironment,
    port,
    databaseUrl,
    databasePoolMax: parseInteger(env.DATABASE_POOL_MAX, 10, "DATABASE_POOL_MAX", 1, 100),
    auth: { secret, baseUrl },
    corsOrigins: [...new Set(corsOrigins)],
    cookie: { secure, sameSite },
    trustProxy: parseBoolean(env.TRUST_PROXY, false, "TRUST_PROXY"),
    maxBodyBytes: parseInteger(env.MAX_BODY_BYTES, 1_048_576, "MAX_BODY_BYTES", 1_024, 10_485_760),
    logLevel: logLevel as AppConfig["logLevel"],
    openApiDocsEnabled: parseBoolean(
      env.OPENAPI_DOCS_ENABLED,
      false,
      "OPENAPI_DOCS_ENABLED",
    ),
    rateLimits: {
      windowMs: parseInteger(env.RATE_LIMIT_WINDOW_MS, 60_000, "RATE_LIMIT_WINDOW_MS", 1_000, 86_400_000),
      auth: parseInteger(env.AUTH_RATE_LIMIT_MAX, 20, "AUTH_RATE_LIMIT_MAX", 1, 10_000),
      orderCreation: parseInteger(env.ORDER_RATE_LIMIT_MAX, 10, "ORDER_RATE_LIMIT_MAX", 1, 10_000),
      reviewCreation: parseInteger(env.REVIEW_RATE_LIMIT_MAX, 10, "REVIEW_RATE_LIMIT_MAX", 1, 10_000),
      publicSearch: parseInteger(env.PUBLIC_SEARCH_RATE_LIMIT_MAX, 60, "PUBLIC_SEARCH_RATE_LIMIT_MAX", 1, 10_000),
    },
  };
};

export const config = loadConfig(process.env);
