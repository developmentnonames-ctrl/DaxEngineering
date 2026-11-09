import { z } from 'zod';

export const APP_NAMES = ['web', 'admin'] as const;
export type AppName = (typeof APP_NAMES)[number];

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
export const LOCKOUT_MAX_FAILURES = 5;
export const LOCKOUT_MINUTES = 15;

export const Username = z
  .string()
  .trim()
  .min(3)
  .max(30)
  .regex(/^[a-zA-Z0-9_.]+$/, 'Letters, numbers, dots and underscores only');

export const Password = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `At least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH);

export const PendingStep = z.enum(['change_password', 'setup_2fa']);
export type PendingStep = z.infer<typeof PendingStep>;

export const MeResponse = z.object({
  user: z.object({
    id: z.string(),
    name: z.string(),
    username: z.string().nullable(),
    email: z.string(),
    isSuperAdmin: z.boolean(),
    twoFactorEnabled: z.boolean(),
  }),
  app: z.enum(APP_NAMES),
  pending: PendingStep.nullable(),
});
export type MeResponse = z.infer<typeof MeResponse>;
