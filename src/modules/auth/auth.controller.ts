import { fromNodeHeaders } from "better-auth/node";
import type { Request, Response } from "express";
import { sendSuccess } from "../../common/responses.js";
import type {
  ChangePasswordInput,
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
} from "./auth.schema.js";
import { authService, type AuthService } from "./auth.service.js";

const applyAuthHeaders = (response: Response, headers: Headers): void => {
  const cookies = typeof headers.getSetCookie === "function"
    ? headers.getSetCookie()
    : headers.get("set-cookie") ? [headers.get("set-cookie")!] : [];
  for (const cookie of cookies) response.append("set-cookie", cookie);
};

export const createAuthController = (service: AuthService = authService) => {
  const register = async (request: Request, response: Response): Promise<void> => {
    const result = await service.register(request.body as RegisterInput, fromNodeHeaders(request.headers));
    applyAuthHeaders(response, result.headers);
    sendSuccess(response, result.data, { status: 201 });
  };

  const login = async (request: Request, response: Response): Promise<void> => {
    const result = await service.login(request.body as LoginInput, fromNodeHeaders(request.headers));
    applyAuthHeaders(response, result.headers);
    sendSuccess(response, result.data);
  };

  const me = async (request: Request, response: Response): Promise<void> => {
    sendSuccess(response, await service.currentUser(request.auth!.userId));
  };

  const logout = async (request: Request, response: Response): Promise<void> => {
    const result = await service.logout(fromNodeHeaders(request.headers));
    applyAuthHeaders(response, result.headers);
    sendSuccess(response, result.data);
  };

  const changePassword = async (request: Request, response: Response): Promise<void> => {
    const result = await service.changePassword(
      request.auth!.userId,
      request.requestId,
      request.body as ChangePasswordInput,
      fromNodeHeaders(request.headers),
    );
    applyAuthHeaders(response, result.headers);
    sendSuccess(response, result.data);
  };

  const verifyEmail = async (request: Request, response: Response): Promise<void> => {
    const token = (request.body?.token ?? request.query.token) as string;
    const result = await service.verifyEmail(token);

    const callbackURL = typeof request.query.callbackURL === "string" ? request.query.callbackURL : null;
    if (request.method === "GET" && callbackURL) {
      response.redirect(callbackURL);
      return;
    }

    sendSuccess(response, result.data);
  };

  const resendVerification = async (request: Request, response: Response): Promise<void> => {
    const result = await service.resendVerification((request.body as { email: string }).email);
    sendSuccess(response, result.data);
  };

  const forgotPassword = async (request: Request, response: Response): Promise<void> => {
    const result = await service.forgotPassword((request.body as ForgotPasswordInput).email);
    sendSuccess(response, result.data);
  };

  const resetPassword = async (request: Request, response: Response): Promise<void> => {
    const result = await service.resetPassword(request.body as ResetPasswordInput, request.requestId);
    sendSuccess(response, result.data);
  };

  return {
    register,
    login,
    me,
    refresh: me,
    logout,
    changePassword,
    verifyEmail,
    resendVerification,
    forgotPassword,
    resetPassword,
  };
};
