import type { Request, Response } from "express";
import { UnauthorizedError } from "../../common/errors/app-error.js";
import { sendSuccess } from "../../common/responses.js";
import type { CreateAdminCategoryInput, UpdateAdminCategoryInput } from "./admin-category.schema.js";
import type { AdminCategoryService } from "./admin-category.service.js";

export const createAdminCategoryController = (service: AdminCategoryService) => ({
  list: async (_request: Request, response: Response): Promise<void> => {
    sendSuccess(response, await service.list());
  },
  create: async (request: Request, response: Response): Promise<void> => {
    if (!request.auth) throw new UnauthorizedError();
    sendSuccess(response, await service.create(
      request.auth.userId,
      request.body as CreateAdminCategoryInput,
      request.requestId,
    ), { status: 201 });
  },
  update: async (request: Request, response: Response): Promise<void> => {
    if (!request.auth) throw new UnauthorizedError();
    sendSuccess(response, await service.update(
      request.auth.userId,
      request.params.id as string,
      request.body as UpdateAdminCategoryInput,
      request.requestId,
    ));
  },
  remove: async (request: Request, response: Response): Promise<void> => {
    if (!request.auth) throw new UnauthorizedError();
    sendSuccess(response, await service.remove(
      request.auth.userId,
      request.params.id as string,
      request.requestId,
    ));
  },
});
