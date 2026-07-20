import { Prisma, type OrderStatus } from "../../../generated/prisma/client.js";
import { prisma } from "../../../lib/prisma.js";

export const DASHBOARD_RECENT_LIMIT = 5;
export const ORDER_STATUSES = ["PLACED", "PREPARING", "READY", "DELIVERED", "CANCELLED"] as const;

export interface DashboardServiceDependencies {
  database: typeof prisma;
  now?: () => Date;
}

export const utcDayRange = (date: Date): { start: Date; end: Date } => {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
};

export const zeroOrderStatusCounts = (): Record<OrderStatus, number> => ({
  PLACED: 0,
  PREPARING: 0,
  READY: 0,
  DELIVERED: 0,
  CANCELLED: 0,
});

const statusCounts = (groups: Array<{ status: OrderStatus; _count: { _all: number } }>) => {
  const counts = zeroOrderStatusCounts();
  for (const group of groups) counts[group.status] = group._count._all;
  return counts;
};

const money = (value: Prisma.Decimal | null | undefined): string => value?.toFixed(2) ?? "0.00";
const iso = (value: Date): string => value.toISOString();

const providerRecentOrderSelect = {
  id: true,
  orderNumber: true,
  status: true,
  total: true,
  customerName: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { items: true } },
} satisfies Prisma.OrderSelect;

const adminRecentOrderSelect = {
  id: true,
  orderNumber: true,
  status: true,
  total: true,
  createdAt: true,
  customer: { select: { id: true, fullName: true, profileImageUrl: true } },
  provider: { select: { id: true, name: true, logoUrl: true } },
  _count: { select: { items: true } },
} satisfies Prisma.OrderSelect;

const recentRegistrationSelect = {
  id: true,
  fullName: true,
  role: true,
  status: true,
  profileImageUrl: true,
  createdAt: true,
  providerProfile: { select: { id: true, name: true, logoUrl: true } },
} satisfies Prisma.UserSelect;

export const createDashboardService = ({
  database,
  now = () => new Date(),
}: DashboardServiceDependencies = { database: prisma }) => ({
  async provider(providerId: string) {
    const { start, end } = utcDayRange(now());
    const [
      activeMealCount,
      todayPlacedOrderCount,
      groupedStatuses,
      recentOrders,
      deliveredRevenue,
    ] = await Promise.all([
      database.meal.count({ where: { providerId, isArchived: false } }),
      database.order.count({
        where: { providerId, status: "PLACED", createdAt: { gte: start, lt: end } },
      }),
      database.order.groupBy({
        by: ["status"],
        where: { providerId },
        _count: { _all: true },
      }),
      database.order.findMany({
        where: { providerId },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: DASHBOARD_RECENT_LIMIT,
        select: providerRecentOrderSelect,
      }),
      database.order.aggregate({
        where: { providerId, status: "DELIVERED" },
        _sum: { total: true },
      }),
    ]);
    const counts = statusCounts(groupedStatuses);
    return {
      activeMealCount,
      todayPlacedOrderCount,
      orderStatusCounts: counts,
      deliveredRevenue: money(deliveredRevenue._sum.total),
      recentOrders: recentOrders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        total: money(order.total),
        customerName: order.customerName,
        itemCount: order._count.items,
        createdAt: iso(order.createdAt),
        updatedAt: iso(order.updatedAt),
      })),
    };
  },

  async admin() {
    const [
      customerCount,
      providerCount,
      activeUserCount,
      suspendedUserCount,
      totalOrderCount,
      groupedStatuses,
      activeMealCount,
      activeCategoryCount,
      recentOrders,
      recentRegistrations,
    ] = await Promise.all([
      database.user.count({ where: { role: "CUSTOMER" } }),
      database.user.count({ where: { role: "PROVIDER" } }),
      database.user.count({ where: { status: "ACTIVE" } }),
      database.user.count({ where: { status: "SUSPENDED" } }),
      database.order.count(),
      database.order.groupBy({ by: ["status"], _count: { _all: true } }),
      database.meal.count({ where: { isArchived: false } }),
      database.category.count({ where: { isActive: true } }),
      database.order.findMany({
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: DASHBOARD_RECENT_LIMIT,
        select: adminRecentOrderSelect,
      }),
      database.user.findMany({
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: DASHBOARD_RECENT_LIMIT,
        select: recentRegistrationSelect,
      }),
    ]);
    return {
      customerCount,
      providerCount,
      activeUserCount,
      suspendedUserCount,
      totalOrderCount,
      orderStatusCounts: statusCounts(groupedStatuses),
      activeMealCount,
      activeCategoryCount,
      recentOrders: recentOrders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        total: money(order.total),
        itemCount: order._count.items,
        createdAt: iso(order.createdAt),
        customer: order.customer,
        provider: order.provider,
      })),
      recentRegistrations: recentRegistrations.map((user) => ({
        id: user.id,
        fullName: user.fullName,
        role: user.role,
        status: user.status,
        profileImageUrl: user.profileImageUrl,
        createdAt: iso(user.createdAt),
        provider: user.providerProfile,
      })),
    };
  },
});

export const dashboardService = createDashboardService();
export type DashboardService = ReturnType<typeof createDashboardService>;
