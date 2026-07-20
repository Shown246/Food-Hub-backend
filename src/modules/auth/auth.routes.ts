import { Router, type RequestHandler } from "express";
import { authenticate } from "../../common/middleware/authentication.js";
import { asyncHandler } from "../../common/middleware/async-handler.js";
import { validateRequest } from "../../common/validation/validate-request.js";
import { createAuthController } from "./auth.controller.js";
import { changePasswordSchema, loginSchema, registerSchema } from "./auth.schema.js";
import { authService, type AuthService } from "./auth.service.js";

export const createAuthRouter = (
  service: AuthService = authService,
  authenticateRequest: RequestHandler = authenticate,
): Router => {
  const router = Router();
  const { changePassword, login, logout, me, refresh, register } = createAuthController(service);

  router.post("/register", validateRequest({ body: registerSchema }), asyncHandler(register));
  router.post("/login", validateRequest({ body: loginSchema }), asyncHandler(login));
  router.get("/me", authenticateRequest, asyncHandler(me));
  router.post("/logout", asyncHandler(logout));
  router.post("/refresh", authenticateRequest, asyncHandler(refresh));
  router.patch(
    "/password",
    authenticateRequest,
    validateRequest({ body: changePasswordSchema }),
    asyncHandler(changePassword),
  );
  return router;
};

export const authRouter = createAuthRouter();
