import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import {
  APIError,
  createAuthMiddleware,
  getSessionFromCtx,
} from 'better-auth/api';
import { twoFactor, username } from 'better-auth/plugins';
import {
  type AppName,
  LOCKOUT_MAX_FAILURES,
  LOCKOUT_MINUTES,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '@dax/platform-contract';
import type { PrismaService } from '@dax/platform-db';
import { isLocked, type LockoutStore, signInIdentifier } from './lockout';
import { type Mailer, passwordLinkEmail } from './mailer';

export const CLIENT_IP_HEADER = 'x-dax-client-ip';
export const RESET_LINK_HOURS = 1;

export interface AuthEvents {
  info(fields: object, message: string): void;
  warn(fields: object, message: string): void;
}

export interface AuthDeps {
  app: AppName;
  origin: string;
  secret: string;
  secureCookies: boolean;
  rateLimit: boolean;
  prisma: PrismaService;
  mailer: Mailer;
  lockout: LockoutStore;
  events: AuthEvents;
  access: {
    adminAllowed(userId: string): Promise<boolean>;
    twoFactorRequired(userId: string): Promise<boolean>;
  };
}

export function cookiePrefix(app: AppName): string {
  return `dax-${app}`;
}

function failedWith(value: unknown, statusCode: number): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { statusCode?: unknown }).statusCode === statusCode
  );
}

function isError(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { statusCode?: unknown }).statusCode === 'number'
  );
}

export function createAuth(d: AuthDeps) {
  return betterAuth({
    appName: 'DAX',
    secret: d.secret,
    baseURL: d.origin,
    basePath: '/api/auth',
    trustedOrigins: [d.origin],
    database: prismaAdapter(d.prisma, { provider: 'postgresql' }),
    telemetry: { enabled: false },
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      resetPasswordTokenExpiresIn: RESET_LINK_HOURS * 3600,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, token }) => {
        const link = `${d.origin}/reset-password?token=${encodeURIComponent(token)}`;
        await d.mailer.send(
          passwordLinkEmail('reset', user, link, `${RESET_LINK_HOURS} hour`),
        );
        d.events.info(
          { event: 'password_reset_requested', userId: user.id, app: d.app },
          'Password reset link sent',
        );
      },
      onPasswordReset: async ({ user }) => {
        await d.prisma.user.update({
          where: { id: user.id },
          data: {
            mustChangePassword: false,
            failedLoginCount: 0,
            lockedUntil: null,
          },
        });
        d.events.info(
          { event: 'password_reset', userId: user.id, app: d.app },
          'Password reset',
        );
      },
    },
    user: {
      additionalFields: {
        isSuperAdmin: {
          type: 'boolean',
          input: false,
          required: false,
          defaultValue: false,
        },
        active: {
          type: 'boolean',
          input: false,
          required: false,
          defaultValue: true,
        },
        mustChangePassword: {
          type: 'boolean',
          input: false,
          required: false,
          defaultValue: false,
        },
      },
    },
    session: {
      expiresIn: 12 * 3600,
      updateAge: 3600,
      freshAge: 15 * 60,
      cookieCache: { enabled: false },
      additionalFields: {
        app: { type: 'string', input: false, required: false },
      },
    },
    rateLimit: {
      enabled: d.rateLimit,
      storage: 'database',
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/*': { window: 60, max: 10 },
        '/two-factor/*': { window: 60, max: 10 },
        '/request-password-reset': { window: 900, max: 3 },
        '/reset-password': { window: 900, max: 10 },
        '/change-password': { window: 900, max: 10 },
      },
    },
    advanced: {
      cookiePrefix: cookiePrefix(d.app),
      useSecureCookies: d.secureCookies,
      defaultCookieAttributes: { sameSite: 'lax', httpOnly: true },
      ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
      database: { generateId: 'uuid' },
    },
    plugins: [
      username(),
      twoFactor({
        issuer:
          d.app === 'admin'
            ? 'DAX Engineering - Admin'
            : 'DAX Engineering - Stores',
        accountLockout: {
          enabled: true,
          maxFailedAttempts: LOCKOUT_MAX_FAILURES,
          durationSeconds: LOCKOUT_MINUTES * 60,
        },
      }),
    ],
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const user = await d.prisma.user.findUnique({
              where: { id: session.userId },
              select: { active: true },
            });
            if (!user?.active) {
              throw new APIError('FORBIDDEN', {
                code: 'ACCOUNT_DISABLED',
                message: 'This account is disabled.',
              });
            }
            if (
              d.app === 'admin' &&
              !(await d.access.adminAllowed(session.userId))
            ) {
              throw new APIError('FORBIDDEN', {
                code: 'NO_ADMIN_ACCESS',
                message: "This account can't use the admin panel.",
              });
            }
            return { data: { ...session, app: d.app } };
          },
          after: async (session) => {
            d.events.info(
              { event: 'signed_in', userId: session.userId, app: d.app },
              'Signed in',
            );
          },
        },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        const identifier = signInIdentifier(ctx.path, ctx.body);
        if (identifier && isLocked(await d.lockout.lockedUntil(identifier))) {
          throw new APIError('TOO_MANY_REQUESTS', {
            code: 'ACCOUNT_LOCKED',
            message: `Too many failed attempts. Try again in ${LOCKOUT_MINUTES} minutes.`,
          });
        }
        if (ctx.path === '/two-factor/disable') {
          const current = await getSessionFromCtx(ctx);
          if (current && (await d.access.twoFactorRequired(current.user.id))) {
            throw new APIError('FORBIDDEN', {
              code: 'TWO_FACTOR_REQUIRED',
              message: 'Your role requires two-step sign-in.',
            });
          }
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        const returned = ctx.context.returned;
        const identifier = signInIdentifier(ctx.path, ctx.body);
        if (identifier) {
          if (failedWith(returned, 401)) {
            const lockedUntil = await d.lockout.recordFailure(
              identifier,
              LOCKOUT_MAX_FAILURES,
              LOCKOUT_MINUTES,
            );
            d.events.warn(
              {
                event: 'sign_in_failed',
                app: d.app,
                locked: lockedUntil !== null,
              },
              'Sign-in failed',
            );
          } else if (!isError(returned)) {
            await d.lockout.reset(identifier);
          }
        }
        if (ctx.path === '/change-password' && !isError(returned)) {
          const userId = ctx.context.session?.user.id;
          if (userId) {
            await d.prisma.user.update({
              where: { id: userId },
              data: { mustChangePassword: false },
            });
            d.events.info(
              { event: 'password_changed', userId, app: d.app },
              'Password changed',
            );
          }
        }
        if (ctx.path.startsWith('/two-factor/') && !isError(returned)) {
          const userId = ctx.context.session?.user.id;
          if (userId && /\/(enable|disable)$/.test(ctx.path)) {
            d.events.info(
              { event: `two_factor_${ctx.path.split('/').pop()}`, userId },
              'Two-step sign-in changed',
            );
          }
        }
      }),
    },
  });
}

export type DaxAuth = ReturnType<typeof createAuth>;
