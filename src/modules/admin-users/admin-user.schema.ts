import { z } from "zod";
import { resourceId, safeText } from "../../common/validation/schemas.js";

export const adminUserParamsSchema = z.object({ id: resourceId }).strict();

export const adminUserListQuerySchema = z.object({
  search: safeText(100).optional(),
  role: z.enum(["CUSTOMER", "PROVIDER"]).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
  sort: z.enum(["newest", "oldest", "name_asc", "name_desc", "last_login_desc"]).optional(),
  page: z.string().regex(/^\d+$/, "Must be a positive integer.").optional(),
  limit: z.string().regex(/^\d+$/, "Must be a positive integer.").optional(),
}).strict();

export const adminUserStatusSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED"]),
}).strict();

export type AdminUserListQuery = z.infer<typeof adminUserListQuerySchema>;
export type AdminUserStatusInput = z.infer<typeof adminUserStatusSchema>;
