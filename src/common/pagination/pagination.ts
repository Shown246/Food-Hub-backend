import { ValidationError } from "../errors/app-error.js";
import type { PaginationMeta } from "../responses.js";

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const MAX_SEARCH_LENGTH = 100;

export interface PaginationInput {
  page: number;
  limit: number;
  skip: number;
  take: number;
}

const positiveInteger = (value: unknown, fallback: number, field: string, maximum?: number): number => {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new ValidationError({ [field]: "Must be a positive integer." });
  }
  const parsed = Number(value);
  if (parsed < 1 || (maximum !== undefined && parsed > maximum)) {
    throw new ValidationError({ [field]: maximum ? `Must be between 1 and ${maximum}.` : "Must be positive." });
  }
  return parsed;
};

export const parsePagination = (query: Record<string, unknown>): PaginationInput => {
  const page = positiveInteger(query.page, 1, "page");
  const limit = positiveInteger(query.limit, DEFAULT_PAGE_SIZE, "limit", MAX_PAGE_SIZE);
  return { page, limit, skip: (page - 1) * limit, take: limit };
};

export const paginationMeta = (page: number, limit: number, totalItems: number): PaginationMeta => {
  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / limit);
  return {
    page,
    limit,
    totalItems,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1 && totalPages > 0,
  };
};

export const parseSearch = (value: unknown): string | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new ValidationError({ search: "Must be a string." });
  const search = value.trim();
  if (!search) return undefined;
  if (search.length > MAX_SEARCH_LENGTH) {
    throw new ValidationError({ search: `Must contain at most ${MAX_SEARCH_LENGTH} characters.` });
  }
  return search;
};

export const parseSort = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T => {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new ValidationError({ sort: `Must be one of: ${allowed.join(", ")}.` });
  }
  return value as T;
};

export const parseDateRange = (fromValue: unknown, toValue: unknown): { from?: Date; to?: Date } => {
  const parseDate = (value: unknown, field: string): Date | undefined => {
    if (value === undefined) return undefined;
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)) {
      throw new ValidationError({ [field]: "Enter a valid ISO 8601 date." });
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new ValidationError({ [field]: "Enter a valid ISO 8601 date." });
    if (/^\d{4}-\d{2}-\d{2}$/.test(value) && date.toISOString().slice(0, 10) !== value) {
      throw new ValidationError({ [field]: "Enter a valid ISO 8601 date." });
    }
    return date;
  };

  const from = parseDate(fromValue, "from");
  const to = parseDate(toValue, "to");
  if (from && to && from > to) {
    throw new ValidationError({ to: "The end date must not be before the start date." });
  }
  return { ...(from ? { from } : {}), ...(to ? { to } : {}) };
};
