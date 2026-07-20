import type { Request, Response } from "express";
import { UnauthorizedError } from "../../common/errors/app-error.js";
import { sendSuccess } from "../../common/responses.js";
import type { AdminUserListQuery, AdminUserStatusInput } from "./admin-user.schema.js";
import type { AdminUserService } from "./admin-user.service.js";

export const createAdminUserController = (service: AdminUserService) => ({
  list: async (request: Request, response: Response): Promise<void> => {
    const result = await service.list(request.query as AdminUserListQuery);
    sendSuccess(response, result.users, { meta: result.meta });
  },
  get: async (request: Request, response: Response): Promise<void> => {
    sendSuccess(response, await service.get(request.params.id as string));
  },
  updateStatus: async (request: Request, response: Response): Promise<void> => {
    if (!request.auth) throw new UnauthorizedError();
    sendSuccess(response, await service.updateStatus(
      request.auth.userId,
      request.params.id as string,
      request.body as AdminUserStatusInput,
      request.requestId,
    ));
  },
});
