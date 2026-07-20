import { Router } from "express";
import { asyncHandler } from "../../common/middleware/async-handler.js";
import { validateRequest } from "../../common/validation/validate-request.js";
import { createCategoryController } from "./category.controller.js";
import { categoryListQuerySchema, categoryParamsSchema } from "./category.schema.js";
import { categoryService, type CategoryService } from "./category.service.js";

export const createCategoryRouter = (service: CategoryService = categoryService): Router => {
  const router = Router();
  const controller = createCategoryController(service);

  router.get(
    "/categories",
    validateRequest({ query: categoryListQuerySchema }),
    asyncHandler(controller.listActive),
  );
  router.get(
    "/categories/:id",
    validateRequest({ params: categoryParamsSchema }),
    asyncHandler(controller.getActive),
  );
  return router;
};

export const categoryRouter = createCategoryRouter();
