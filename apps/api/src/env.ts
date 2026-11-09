import { z } from 'zod';
import { PASSWORD_MIN_LENGTH, Username } from '@dax/platform-contract';

const Secret = z.string().min(32);
const blankAsUnset = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());
const Origin = z
  .url()
  .refine((u) => new URL(u).origin === u, 'Origin only, no path or slash');

const EnvSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    API_HOST: z.string().default('127.0.0.1'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
      .default('info'),
    DATABASE_URL: z
      .string()
      .url()
      .refine(
        (url) => /^postgres(ql)?:\/\//.test(url),
        'DATABASE_URL must be a postgres:// URL',
      )
      .refine(
        (url) => !/\/\/(postgres|dax_migrator)[:@]/.test(url),
        'DATABASE_URL must use the app role',
      ),
    BETTER_AUTH_SECRET: Secret,
    INTERNAL_TOKEN_WEB: Secret,
    INTERNAL_TOKEN_ADMIN: Secret,
    WEB_ORIGIN: Origin,
    ADMIN_ORIGIN: Origin,
    RESEND_API_KEY: blankAsUnset(z.string().min(1)),
    MAIL_FROM: blankAsUnset(z.string().min(3)),
    BOOTSTRAP_ADMIN_NAME: blankAsUnset(z.string().trim().min(1)),
    BOOTSTRAP_ADMIN_USERNAME: blankAsUnset(Username),
    BOOTSTRAP_ADMIN_EMAIL: blankAsUnset(z.email()),
    BOOTSTRAP_ADMIN_PASSWORD: blankAsUnset(z.string().min(PASSWORD_MIN_LENGTH)),
  })
  .superRefine((env, ctx) => {
    if (env.INTERNAL_TOKEN_WEB === env.INTERNAL_TOKEN_ADMIN) {
      ctx.addIssue({
        code: 'custom',
        path: ['INTERNAL_TOKEN_ADMIN'],
        message: 'Must differ from INTERNAL_TOKEN_WEB',
      });
    }
    if (env.NODE_ENV === 'production') {
      for (const key of ['RESEND_API_KEY', 'MAIL_FROM'] as const) {
        if (!env[key])
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: 'Required in production',
          });
      }
      for (const key of ['WEB_ORIGIN', 'ADMIN_ORIGIN'] as const) {
        if (!env[key].startsWith('https://'))
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: 'Must be https in production',
          });
      }
    }
    if (env.RESEND_API_KEY && !env.MAIL_FROM) {
      ctx.addIssue({
        code: 'custom',
        path: ['MAIL_FROM'],
        message: 'Required with RESEND_API_KEY',
      });
    }
    const bootstrap = [
      'BOOTSTRAP_ADMIN_NAME',
      'BOOTSTRAP_ADMIN_USERNAME',
      'BOOTSTRAP_ADMIN_EMAIL',
      'BOOTSTRAP_ADMIN_PASSWORD',
    ] as const;
    const set = bootstrap.filter((k) => env[k] !== undefined);
    if (set.length > 0 && set.length < bootstrap.length) {
      for (const key of bootstrap.filter((k) => env[k] === undefined)) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: 'Set all BOOTSTRAP_ADMIN_* variables or none',
        });
      }
    }
  });

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    // Name the bad variables, never print their values.
    const names = [
      ...new Set(parsed.error.issues.map((i) => i.path.join('.'))),
    ];
    throw new Error(`Invalid API environment: ${names.join(', ')}`);
  }
  return parsed.data;
}
