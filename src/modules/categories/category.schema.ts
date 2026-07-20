import { z } from "zod";
import { resourceId } from "../../common/validation/schemas.js";

export const categoryParamsSchema = z.object({ id: resourceId }).strict();
export const categoryListQuerySchema = z.object({}).strict();
