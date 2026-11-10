import { z } from 'zod';

export const Uuid = z.uuid();

export const Qty = z
  .string()
  .regex(
    /^\d{1,11}(\.\d{1,3})?$/,
    'Quantity must be a positive number with up to 3 decimals',
  );

export const Version = z.int().nonnegative();

export const ApiError = z.object({
  code: z.string(),
  message: z.string(),
  fields: z.array(z.string()).optional(),
  requestId: z.string().optional(),
});
export type ApiError = z.infer<typeof ApiError>;

export const HealthStatus = z.object({
  status: z.enum(['ok', 'degraded']),
  checks: z.record(z.string(), z.enum(['up', 'down'])).optional(),
});
export type HealthStatus = z.infer<typeof HealthStatus>;

export const ImportRowError = z.object({
  row: z.number().int(),
  field: z.string().nullable(),
  message: z.string(),
});
export const ImportResult = z.object({
  dryRun: z.boolean(),
  total: z.number().int(),
  created: z.number().int(),
  errors: z.array(ImportRowError),
});
export type ImportResult = z.infer<typeof ImportResult>;

export const OptionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();

/** Rows per page offered in the UI; the first is the default. */
export const PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = PAGE_SIZES[0];
export const MAX_PAGE_SIZE = 100;

/** One numbered page of a list, with the total across all pages. */
export function pageOf<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    total: z.int().min(0),
    page: z.int().min(1),
    limit: z.int().min(1),
  });
}

export const PageParams = z.object({
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE),
});
export type PageParams = z.infer<typeof PageParams>;

export const PageQuery = PageParams.extend({
  q: z.string().trim().max(100).optional(),
});

/** Prisma `skip`/`take` for a page. */
export function pageWindow(p: PageParams): { skip: number; take: number } {
  return { skip: (p.page - 1) * p.limit, take: p.limit };
}

/** The paging fields of a page response. */
export function pageMeta(
  p: PageParams,
  total: number,
): { total: number; page: number; limit: number } {
  return { total, page: p.page, limit: p.limit };
}
