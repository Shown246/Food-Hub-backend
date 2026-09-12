import { Router, type RequestHandler } from "express";
import { authenticate } from "../../common/middleware/authentication.js";
import { asyncHandler } from "../../common/middleware/async-handler.js";
import { validateRequest } from "../../common/validation/validate-request.js";
import { createAuthController } from "./auth.controller.js";
import { z } from "zod";
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from "./auth.schema.js";
import { authService, type AuthService } from "./auth.service.js";

const verifyEmailQuerySchema = z.object({
  token: z.string().min(1, "Verification token is required."),
  callbackURL: z.string().optional(),
});

export const createAuthRouter = (
  service: AuthService = authService,
  authenticateRequest: RequestHandler = authenticate,
): Router => {
  const router = Router();
  const {
    changePassword,
    forgotPassword,
    login,
    logout,
    me,
    refresh,
    register,
    resendVerification,
    resetPassword,
    verifyEmail,
  } = createAuthController(service);

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
  router.post("/verify-email", validateRequest({ body: verifyEmailSchema }), asyncHandler(verifyEmail));
  router.get("/verify-email", validateRequest({ query: verifyEmailQuerySchema }), asyncHandler(verifyEmail));
  router.post("/resend-verification", validateRequest({ body: resendVerificationSchema }), asyncHandler(resendVerification));
  router.post("/forgot-password", validateRequest({ body: forgotPasswordSchema }), asyncHandler(forgotPassword));
  router.post("/reset-password", validateRequest({ body: resetPasswordSchema }), asyncHandler(resetPassword));
  return router;
};

export const authRouter = createAuthRouter();
