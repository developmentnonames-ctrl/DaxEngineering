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
