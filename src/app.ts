import cors from "cors";
import express, { type Application, type RequestHandler } from "express";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import { prisma } from "../lib/prisma.js";
import { ForbiddenError, ServiceUnavailableError } from "./common/errors/app-error.js";
import { createErrorHandler, notFoundHandler } from "./common/middleware/error-handler.js";
import { requestContext } from "./common/middleware/request-context.js";
import { createRequestLogger } from "./common/middleware/request-logger.js";
import { logger as defaultLogger, type SafeLogger } from "./common/logging/logger.js";
import { sendSuccess } from "./common/responses.js";
import { authRateLimiter } from "./common/security/rate-limiters.js";
import { requireTrustedOrigin } from "./common/security/trusted-origin.js";
import { config } from "./config/index.js";
import { openApiDocument } from "./docs/openapi.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { categoryRouter } from "./modules/categories/category.routes.js";
import { mealRouter } from "./modules/meals/meal.routes.js";
import { profileRouter } from "./modules/profiles/profile.routes.js";
import { providerRouter } from "./modules/providers/provider.routes.js";
import { providerMealRouter } from "./modules/provider-meals/provider-meal.routes.js";
import { orderRouter } from "./modules/orders/order.routes.js";
import { reviewRouter } from "./modules/reviews/review.routes.js";
import { adminUserRouter } from "./modules/admin-users/admin-user.routes.js";
import { adminOrderRouter } from "./modules/admin-orders/admin-order.routes.js";
import { adminCategoryRouter } from "./modules/admin-categories/admin-category.routes.js";
import { dashboardRouter } from "./modules/dashboards/dashboard.routes.js";

export interface AppDependencies {
  authHandler?: RequestHandler;
  authRoutes?: RequestHandler;
  categoryRoutes?: RequestHandler;
  mealRoutes?: RequestHandler;
  profileRoutes?: RequestHandler;
  providerRoutes?: RequestHandler;
  providerMealRoutes?: RequestHandler;
  orderRoutes?: RequestHandler;
  reviewRoutes?: RequestHandler;
  adminUserRoutes?: RequestHandler;
  adminOrderRoutes?: RequestHandler;
  adminCategoryRoutes?: RequestHandler;
  dashboardRoutes?: RequestHandler;
  openApiDocsEnabled?: boolean;
  checkDatabase?: () => Promise<void>;
  logger?: SafeLogger;
  configureRoutes?: (application: Application) => void;
}

const defaultDatabaseCheck = async (): Promise<void> => {
  await prisma.$queryRaw`SELECT 1`;
};

export const createApp = (dependencies: AppDependencies = {}): Application => {
  const application = express();
  const checkDatabase = dependencies.checkDatabase ?? defaultDatabaseCheck;
  const logger = dependencies.logger ?? defaultLogger;
  const openApiDocsEnabled = dependencies.openApiDocsEnabled ?? config.openApiDocsEnabled;

  if (config.trustProxy) application.set("trust proxy", 1);

  application.disable("x-powered-by");
  application.use(requestContext);
  application.use(createRequestLogger(logger));
  application.use(helmet());
  application.use(cors({
    origin(origin, callback) {
      if (!origin || config.corsOrigins.includes(origin)) return callback(null, true);
      return callback(new ForbiddenError("The request origin is not allowed.", "CORS_ORIGIN_DENIED"));
    },
    credentials: true,
  }));

  application.use("/api/auth", authRateLimiter());
  application.use(express.json({ limit: config.maxBodyBytes }));
  application.use(requireTrustedOrigin(config.corsOrigins));

  if (openApiDocsEnabled) {
    application.get("/api/openapi.json", (_request, response) => response.json(openApiDocument));
    application.use(
      "/api/docs",
      swaggerUi.serve,
      swaggerUi.setup(openApiDocument, {
        customSiteTitle: "FoodHub API documentation",
        swaggerOptions: { persistAuthorization: false },
      }),
    );
  }

  // Only the FoodHub adapters are public. Better Auth is called server-side so
  // its native routes cannot bypass account-status or response-envelope rules.
  application.use("/api/auth", dependencies.authRoutes ?? authRouter);
  application.use("/api", dependencies.profileRoutes ?? profileRouter);
  application.use("/api", dependencies.categoryRoutes ?? categoryRouter);
  application.use("/api", dependencies.mealRoutes ?? mealRouter);
  application.use("/api", dependencies.providerRoutes ?? providerRouter);
  application.use("/api", dependencies.providerMealRoutes ?? providerMealRouter);
  application.use("/api", dependencies.orderRoutes ?? orderRouter);
  application.use("/api", dependencies.reviewRoutes ?? reviewRouter);
  application.use("/api", dependencies.adminUserRoutes ?? adminUserRouter);
  application.use("/api", dependencies.adminOrderRoutes ?? adminOrderRouter);
  application.use("/api", dependencies.adminCategoryRoutes ?? adminCategoryRouter);
  application.use("/api", dependencies.dashboardRoutes ?? dashboardRouter);

  application.get("/api/health", async (_request, response, next) => {
    try {
      await checkDatabase();
      sendSuccess(response, { status: "ok", checks: { database: "up" } });
    } catch {
      next(new ServiceUnavailableError("Database readiness check failed."));
    }
  });

  dependencies.configureRoutes?.(application);

  application.get("/", (_request, response) => {
    response.type("text/plain").send("FoodHub API");
  });

  application.use(notFoundHandler);
  application.use(createErrorHandler(logger));
  return application;
};

export const app = createApp();
