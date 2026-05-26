export interface PaginationQuery {
  page: number;
  limit: number;
  skip: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginatedResult<T> {
  items: T[];
  meta: PaginationMeta;
}

export interface PaginationOptions {
  page?: string;
  limit?: string;
  defaultLimit?: number;
  maxLimit?: number;
}

export function parsePagination(options: PaginationOptions): PaginationQuery {
  const defaultLimit = options.defaultLimit ?? 20;
  const maxLimit = options.maxLimit ?? 100;

  const rawPage = Number(options.page ?? '1');
  const rawLimit = Number(options.limit ?? String(defaultLimit));

  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(Math.floor(rawLimit), maxLimit)
      : Math.min(defaultLimit, maxLimit);

  return {
    page,
    limit,
    skip: (page - 1) * limit
  };
}

export function buildPaginationMeta(total: number, query: PaginationQuery): PaginationMeta {
  const totalPages = Math.max(1, Math.ceil(total / query.limit));
  return {
    page: query.page,
    limit: query.limit,
    total,
    totalPages,
    hasNext: query.page < totalPages,
    hasPrev: query.page > 1
  };
}
