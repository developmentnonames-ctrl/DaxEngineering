import { createAuthClient } from 'better-auth/react';
import { twoFactorClient, usernameClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  plugins: [usernameClient(), twoFactorClient()],
});

const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: 'Wrong username, email or password.',
  INVALID_USERNAME_OR_PASSWORD: 'Wrong username, email or password.',
  ACCOUNT_LOCKED: 'Too many failed attempts. Try again in 15 minutes.',
  ACCOUNT_DISABLED: 'This account is disabled. Ask an administrator.',
  NO_ADMIN_ACCESS: "This account can't use the admin panel.",
  INVALID_CODE: 'That code is not right. Try the latest one.',
  INVALID_TWO_FACTOR_COOKIE: 'Sign-in took too long. Start again.',
  INVALID_TOKEN: 'This link has expired or was already used.',
  INVALID_PASSWORD: 'Your current password is not right.',
  PASSWORD_TOO_SHORT: 'Use at least 12 characters.',
  TWO_FACTOR_REQUIRED: 'Super admins must keep two-step sign-in on.',
};

export function authErrorMessage(
  error: { code?: string; message?: string; status?: number } | null,
): string {
  if (!error) return 'Something went wrong. Try again.';
  if (error.code && MESSAGES[error.code]) return MESSAGES[error.code];
  if (error.status === 429)
    return 'Too many attempts. Wait a minute and try again.';
  return 'Something went wrong. Try again.';
}

export function safeNextPath(value: string | null | undefined): string {
  return value && value.startsWith('/') && !value.startsWith('//')
    ? value
    : '/';
}
