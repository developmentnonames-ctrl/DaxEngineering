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

export function pageOf<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item), nextCursor: z.string().nullable() });
}

export const PageQuery = z.object({
  q: z.string().trim().max(100).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
