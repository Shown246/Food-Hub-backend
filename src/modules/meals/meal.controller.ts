import type { Request, Response } from "express";
import { sendSuccess } from "../../common/responses.js";
import type { MealListQuery } from "./meal.schema.js";
import { mealService, type MealService } from "./meal.service.js";

export const createMealController = (service: MealService = mealService) => ({
  listOrderable: async (request: Request, response: Response): Promise<void> => {
    const result = await service.listOrderable(request.query as MealListQuery);
    sendSuccess(response, result.meals, { meta: result.meta });
  },

  getOrderable: async (request: Request, response: Response): Promise<void> => {
    sendSuccess(response, await service.getOrderable(request.params.id as string));
  },
});
