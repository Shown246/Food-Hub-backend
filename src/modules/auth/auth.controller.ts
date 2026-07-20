import { fromNodeHeaders } from "better-auth/node";
import type { Request, Response } from "express";
import { sendSuccess } from "../../common/responses.js";
import type { ChangePasswordInput, LoginInput, RegisterInput } from "./auth.schema.js";
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

  return { register, login, me, refresh: me, logout, changePassword };
};
