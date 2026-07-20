import type { Request, Response } from "express";
import { UnauthorizedError } from "../../common/errors/app-error.js";
import { sendSuccess } from "../../common/responses.js";
import type { DashboardService } from "./dashboard.service.js";

export const createDashboardController = (service: DashboardService) => ({
  provider: async (request: Request, response: Response): Promise<void> => {
    if (!request.auth?.providerId) throw new UnauthorizedError();
    sendSuccess(response, await service.provider(request.auth.providerId));
  },
  admin: async (_request: Request, response: Response): Promise<void> => {
    sendSuccess(response, await service.admin());
  },
});
