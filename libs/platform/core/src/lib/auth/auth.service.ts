import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { fromNodeHeaders } from 'better-auth/node';
import { generateRandomString } from 'better-auth/crypto';
import { APP_NAMES, type AppName } from '@dax/platform-contract';
import { PrismaService } from '@dax/platform-db';
import { createAuth, type DaxAuth } from './auth.factory';
import type { DaxRequest } from './internal-caller';
import { PrismaLockoutStore } from './lockout';
import {
  LogMailer,
  type Mailer,
  type PasswordLinkKind,
  passwordLinkEmail,
  ResendMailer,
} from './mailer';
import type { SessionUser } from './session-user';

export interface BootstrapAdmin {
  name: string;
  username: string;
  email: string;
  password: string;
}

export interface AuthOptions {
  secret: string;
  origins: Record<AppName, string>;
  internalTokens: Record<AppName, string>;
  production: boolean;
  resend?: { apiKey: string; from: string };
  bootstrapAdmin?: BootstrapAdmin;
}

export const AUTH_OPTIONS = Symbol.for('dax.platform-core.auth-options');
export const INVITE_LINK_HOURS = 72;

@Injectable()
export class AuthService implements OnApplicationBootstrap {
  private readonly logger = new Logger('Auth');
  readonly instances: Record<AppName, DaxAuth>;
  readonly mailer: Mailer;

  constructor(
    @Inject(AUTH_OPTIONS) private readonly options: AuthOptions,
    private readonly prisma: PrismaService,
  ) {
    this.mailer = options.resend
      ? new ResendMailer(options.resend.apiKey, options.resend.from)
      : new LogMailer((fields, message) => this.logger.warn(fields, message));
    const lockout = new PrismaLockoutStore(prisma);
    const events = {
      info: (fields: object, message: string) =>
        this.logger.log(fields, message),
      warn: (fields: object, message: string) =>
        this.logger.warn(fields, message),
    };
    this.instances = Object.fromEntries(
      APP_NAMES.map((app) => [
        app,
        createAuth({
          app,
          origin: options.origins[app],
          secret: options.secret,
          secureCookies: options.production,
          rateLimit: options.production,
          prisma,
          mailer: this.mailer,
          lockout,
          events,
        }),
      ]),
    ) as Record<AppName, DaxAuth>;
  }

  async getSession(
    req: DaxRequest,
  ): Promise<{ sessionId: string; app: string; user: SessionUser } | null> {
    if (!req.daxApp) return null;
    const result = await this.instances[req.daxApp].api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    if (!result) return null;
    return {
      sessionId: result.session.id,
      app: String((result.session as { app?: unknown }).app ?? ''),
      user: result.user,
    };
  }

  async sendPasswordLink(
    userId: string,
    app: AppName,
    kind: PasswordLinkKind,
  ): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, name: true, email: true },
    });
    const ctx = await this.instances[app].$context;
    const token = generateRandomString(32);
    await ctx.internalAdapter.createVerificationValue({
      value: user.id,
      identifier: `reset-password:${token}`,
      expiresAt: new Date(Date.now() + INVITE_LINK_HOURS * 3600 * 1000),
    });
    const link = `${this.options.origins[app]}/reset-password?token=${encodeURIComponent(token)}`;
    await this.mailer.send(
      passwordLinkEmail(kind, user, link, `${INVITE_LINK_HOURS} hours`),
    );
  }

  async onApplicationBootstrap(): Promise<void> {
    const admin = this.options.bootstrapAdmin;
    if (!admin) return;
    if ((await this.prisma.user.count()) > 0) {
      this.logger.warn(
        'BOOTSTRAP_ADMIN_* is set but users already exist; remove those variables from the environment',
      );
      return;
    }
    const ctx = await this.instances.admin.$context;
    const hash = await ctx.password.hash(admin.password);
    try {
      await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            name: admin.name,
            email: admin.email.toLowerCase(),
            emailVerified: true,
            username: admin.username.toLowerCase(),
            displayUsername: admin.username,
            isSuperAdmin: true,
            mustChangePassword: true,
          },
        });
        await tx.account.create({
          data: {
            userId: user.id,
            providerId: 'credential',
            accountId: user.id,
            password: hash,
          },
        });
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') return;
      throw error;
    }
    this.logger.warn(
      'Created the first super admin. Sign in to the admin app, change the password, then remove BOOTSTRAP_ADMIN_PASSWORD from the environment',
    );
  }
}
