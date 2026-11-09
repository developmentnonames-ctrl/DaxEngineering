import { DynamicModule, Module } from '@nestjs/common';
import {
  type AuthOptions,
  AuthModule,
  createLoggerModule,
} from '@dax/platform-core';
import { DatabaseModule } from '@dax/platform-db';
import type { Env } from '../env';
import { HealthController } from './health/health.controller';

export const QUIET_PATHS = ['/api/health/live', '/api/health/ready'];

export function authOptions(env: Env): AuthOptions {
  return {
    secret: env.BETTER_AUTH_SECRET,
    origins: { web: env.WEB_ORIGIN, admin: env.ADMIN_ORIGIN },
    internalTokens: {
      web: env.INTERNAL_TOKEN_WEB,
      admin: env.INTERNAL_TOKEN_ADMIN,
    },
    production: env.NODE_ENV === 'production',
    resend:
      env.RESEND_API_KEY && env.MAIL_FROM
        ? { apiKey: env.RESEND_API_KEY, from: env.MAIL_FROM }
        : undefined,
    bootstrapAdmin:
      env.BOOTSTRAP_ADMIN_NAME &&
      env.BOOTSTRAP_ADMIN_USERNAME &&
      env.BOOTSTRAP_ADMIN_EMAIL &&
      env.BOOTSTRAP_ADMIN_PASSWORD
        ? {
            name: env.BOOTSTRAP_ADMIN_NAME,
            username: env.BOOTSTRAP_ADMIN_USERNAME,
            email: env.BOOTSTRAP_ADMIN_EMAIL,
            password: env.BOOTSTRAP_ADMIN_PASSWORD,
          }
        : undefined,
  };
}

@Module({})
export class AppModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: AppModule,
      imports: [
        createLoggerModule({
          level: env.LOG_LEVEL,
          pretty: env.NODE_ENV === 'development',
          quietPaths: QUIET_PATHS,
        }),
        DatabaseModule.forRoot({
          url: env.DATABASE_URL,
          applicationName: 'dax-api',
        }),
        AuthModule.forRoot(authOptions(env)),
      ],
      controllers: [HealthController],
    };
  }
}
