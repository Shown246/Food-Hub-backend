import type { Request, Response } from "express";
import { sendSuccess } from "../../common/responses.js";
import { categoryService, type CategoryService } from "./category.service.js";

export const createCategoryController = (service: CategoryService = categoryService) => ({
  listActive: async (_request: Request, response: Response): Promise<void> => {
    sendSuccess(response, await service.listActive());
  },

  getActive: async (request: Request, response: Response): Promise<void> => {
    sendSuccess(response, await service.getActive(request.params.id as string));
  },
});
