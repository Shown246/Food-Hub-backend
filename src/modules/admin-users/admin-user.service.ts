import type { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../../lib/prisma.js";
import { ConflictError, ForbiddenError, NotFoundError } from "../../common/errors/app-error.js";
import { paginationMeta, parsePagination } from "../../common/pagination/pagination.js";
import { publicProviderSelect } from "../../common/serialization/selectors.js";
import { serializePublicProvider } from "../../common/serialization/serializers.js";
import type { AdminUserListQuery, AdminUserStatusInput } from "./admin-user.schema.js";

export interface AdminUserServiceDependencies {
  database: typeof prisma;
}

const adminUserListSelect = {
  id: true,
  fullName: true,
  email: true,
  phone: true,
  role: true,
  status: true,
  profileImageUrl: true,
  lastLoginAt: true,
  createdAt: true,
  providerProfile: { select: publicProviderSelect },
} satisfies Prisma.UserSelect;

const adminUserDetailSelect = {
  ...adminUserListSelect,
  emailVerified: true,
  defaultDeliveryAddress: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

type AdminUserListRecord = Prisma.UserGetPayload<{ select: typeof adminUserListSelect }>;
type AdminUserDetailRecord = Prisma.UserGetPayload<{ select: typeof adminUserDetailSelect }>;

const iso = (value: Date): string => value.toISOString();
const serializeAdminUserListItem = (user: AdminUserListRecord) => ({
  id: user.id,
  fullName: user.fullName,
  email: user.email,
  phone: user.phone,
  role: user.role,
  status: user.status,
  profileImageUrl: user.profileImageUrl,
  lastLoginAt: user.lastLoginAt ? iso(user.lastLoginAt) : null,
  createdAt: iso(user.createdAt),
  providerProfile: user.providerProfile ? serializePublicProvider(user.providerProfile) : null,
});

const serializeAdminUserDetail = (user: AdminUserDetailRecord) => ({
  ...serializeAdminUserListItem(user),
  emailVerified: user.emailVerified,
  defaultDeliveryAddress: user.defaultDeliveryAddress,
  updatedAt: iso(user.updatedAt),
});

export const adminUserOrderBy = (
  sort: AdminUserListQuery["sort"],
): Prisma.UserOrderByWithRelationInput[] => {
  switch (sort) {
    case "oldest": return [{ createdAt: "asc" }, { id: "asc" }];
    case "name_asc": return [{ fullName: "asc" }, { id: "asc" }];
    case "name_desc": return [{ fullName: "desc" }, { id: "asc" }];
    case "last_login_desc": return [{ lastLoginAt: { sort: "desc", nulls: "last" } }, { id: "asc" }];
    default: return [{ createdAt: "desc" }, { id: "asc" }];
  }
};

const managedUserWhere = (query: AdminUserListQuery): Prisma.UserWhereInput => ({
  role: query.role ?? { in: ["CUSTOMER", "PROVIDER"] },
  ...(query.status ? { status: query.status } : {}),
  ...(query.search ? {
    OR: [
      { fullName: { contains: query.search, mode: "insensitive" } },
      { email: { contains: query.search, mode: "insensitive" } },
      { providerProfile: { is: { name: { contains: query.search, mode: "insensitive" } } } },
    ],
  } : {}),
});

const userNotFound = () => new NotFoundError("The user was not found.", "USER_NOT_FOUND");

export const createAdminUserService = (
  { database }: AdminUserServiceDependencies = { database: prisma },
) => ({
  async list(query: AdminUserListQuery) {
    const pagination = parsePagination(query);
    const where = managedUserWhere(query);
    const [totalItems, users] = await Promise.all([
      database.user.count({ where }),
      database.user.findMany({
        where,
        orderBy: adminUserOrderBy(query.sort),
        skip: pagination.skip,
        take: pagination.take,
        select: adminUserListSelect,
      }),
    ]);
    return {
      users: users.map(serializeAdminUserListItem),
      meta: paginationMeta(pagination.page, pagination.limit, totalItems),
    };
  },

  async get(userId: string) {
    const user = await database.user.findUnique({ where: { id: userId }, select: adminUserDetailSelect });
    if (!user) throw userNotFound();
    return serializeAdminUserDetail(user);
  },

  async updateStatus(
    actorUserId: string,
    targetUserId: string,
    input: AdminUserStatusInput,
    requestId?: string,
  ) {
    const user = await database.$transaction(async (transaction) => {
      const target = await transaction.user.findUnique({
        where: { id: targetUserId },
        select: { role: true, status: true },
      });
      if (!target) throw userNotFound();
      if (target.role === "ADMIN") {
        throw new ForbiddenError("Admin account status cannot be changed through this endpoint.", "ADMIN_STATUS_IMMUTABLE");
      }
      if (target.status === input.status) {
        return transaction.user.findUniqueOrThrow({ where: { id: targetUserId }, select: adminUserDetailSelect });
      }

      const updated = await transaction.user.updateMany({
        where: { id: targetUserId, role: { in: ["CUSTOMER", "PROVIDER"] }, status: target.status },
        data: { status: input.status },
      });
      if (updated.count === 0) {
        const current = await transaction.user.findUnique({
          where: { id: targetUserId },
          select: { status: true },
        });
        if (!current) throw userNotFound();
        if (current.status === input.status) {
          return transaction.user.findUniqueOrThrow({ where: { id: targetUserId }, select: adminUserDetailSelect });
        }
        throw new ConflictError("The user status changed before this request completed.", "USER_STATUS_CONFLICT");
      }

      if (input.status === "SUSPENDED") {
        await transaction.session.deleteMany({ where: { userId: targetUserId } });
      }
      await transaction.auditEvent.create({
        data: {
          actorType: "USER",
          actorUserId,
          actorRole: "ADMIN",
          action: input.status === "SUSPENDED" ? "USER_SUSPENDED" : "USER_REACTIVATED",
          entityType: "USER",
          entityId: targetUserId,
          requestId,
          metadata: { previousStatus: target.status, status: input.status, targetRole: target.role },
        },
      });
      return transaction.user.findUniqueOrThrow({ where: { id: targetUserId }, select: adminUserDetailSelect });
    });
    return serializeAdminUserDetail(user);
  },
});

export const adminUserService = createAdminUserService();
export type AdminUserService = ReturnType<typeof createAdminUserService>;
