import { z } from 'zod';

const EnvSchema = z.object({
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
