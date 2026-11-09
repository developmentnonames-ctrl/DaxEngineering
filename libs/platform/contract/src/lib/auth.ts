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

export const AdminUser = z.object({
  id: z.string(),
  name: z.string(),
  username: z.string().nullable(),
  email: z.string(),
  isSuperAdmin: z.boolean(),
  active: z.boolean(),
  twoFactorEnabled: z.boolean(),
  lockedUntil: z.string().nullable(),
  hasPassword: z.boolean(),
  createdAt: z.string(),
});
export type AdminUser = z.infer<typeof AdminUser>;

export const AdminUserList = z.object({ users: z.array(AdminUser) });
export type AdminUserList = z.infer<typeof AdminUserList>;

export const CreateUserInput = z.strictObject({
  name: z.string().trim().min(1).max(100),
  username: Username,
  email: z.email().max(254),
  isSuperAdmin: z.boolean().default(false),
});
export type CreateUserInput = z.infer<typeof CreateUserInput>;
