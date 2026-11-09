import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';

const base = {
  DATABASE_URL: 'postgresql://dax_app:pw@localhost:5432/dax',
  BETTER_AUTH_SECRET: 's'.repeat(40),
  INTERNAL_TOKEN_WEB: 'w'.repeat(40),
  INTERNAL_TOKEN_ADMIN: 'a'.repeat(40),
  WEB_ORIGIN: 'http://localhost:4200',
  ADMIN_ORIGIN: 'http://localhost:4300',
};

describe('loadEnv', () => {
  it('accepts a minimal development setup', () => {
    const env = loadEnv(base);
    expect(env.NODE_ENV).toBe('development');
    expect(env.RESEND_API_KEY).toBeUndefined();
  });

  it('refuses the migrator role and names bad variables without values', () => {
    expect(() =>
      loadEnv({
        ...base,
        DATABASE_URL: 'postgresql://dax_migrator:topsecret@localhost/dax',
      }),
    ).toThrow(/DATABASE_URL/);
    try {
      loadEnv({ ...base, BETTER_AUTH_SECRET: 'short-secret-value' });
    } catch (error) {
      expect(String(error)).toContain('BETTER_AUTH_SECRET');
      expect(String(error)).not.toContain('short-secret-value');
    }
  });

  it('requires different tokens per app', () => {
    expect(() =>
      loadEnv({ ...base, INTERNAL_TOKEN_ADMIN: base.INTERNAL_TOKEN_WEB }),
    ).toThrow(/INTERNAL_TOKEN_ADMIN/);
  });

  it('requires email and https origins in production', () => {
    expect(() => loadEnv({ ...base, NODE_ENV: 'production' })).toThrow(
      /RESEND_API_KEY.*MAIL_FROM.*WEB_ORIGIN.*ADMIN_ORIGIN/,
    );
    expect(
      loadEnv({
        ...base,
        NODE_ENV: 'production',
        WEB_ORIGIN: 'https://stores.example.test',
        ADMIN_ORIGIN: 'https://admin.example.test',
        RESEND_API_KEY: 're_test',
        MAIL_FROM: 'DAX <no-reply@example.test>',
      }).NODE_ENV,
    ).toBe('production');
  });

  it('wants all first-admin variables or none, treating blanks as unset', () => {
    expect(() =>
      loadEnv({ ...base, BOOTSTRAP_ADMIN_USERNAME: 'admin' }),
    ).toThrow(/BOOTSTRAP_ADMIN_PASSWORD/);
    expect(
      loadEnv({
        ...base,
        BOOTSTRAP_ADMIN_NAME: '',
        BOOTSTRAP_ADMIN_USERNAME: '',
        BOOTSTRAP_ADMIN_EMAIL: '',
        BOOTSTRAP_ADMIN_PASSWORD: '',
      }).BOOTSTRAP_ADMIN_USERNAME,
    ).toBeUndefined();
  });
});
