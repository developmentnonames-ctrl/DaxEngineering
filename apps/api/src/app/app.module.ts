import { DynamicModule, Module } from '@nestjs/common';
import {
  type AuthOptions,
  createLoggerModule,
  PlatformModule,
} from '@dax/platform-core';
import { DatabaseModule } from '@dax/platform-db';
import type { Env } from '../env';
import {
  INSTALLED_MODULES,
  MODULE_ENTITIES,
  MODULE_SERVERS,
} from '../module-catalog';
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
  static forRoot(env: Env, enabled: ReadonlySet<string>): DynamicModule {
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
        PlatformModule.forRoot({
          auth: authOptions(env),
          catalog: { modules: INSTALLED_MODULES, entities: MODULE_ENTITIES },
          files:
            env.S3_ENDPOINT &&
            env.S3_BUCKET &&
            env.S3_ACCESS_KEY_ID &&
            env.S3_SECRET_ACCESS_KEY
              ? {
                  endpoint: env.S3_ENDPOINT,
                  bucket: env.S3_BUCKET,
                  accessKeyId: env.S3_ACCESS_KEY_ID,
                  secretAccessKey: env.S3_SECRET_ACCESS_KEY,
                  region: env.S3_REGION,
                }
              : undefined,
          crypto: {
            keys: env.DATA_ENCRYPTION_KEYS,
            activeKey: env.DATA_ENCRYPTION_ACTIVE_KEY,
          },
        }),
        ...Object.entries(MODULE_SERVERS)
          .filter(([key]) => enabled.has(key))
          .map(([, server]) => server),
      ],
      controllers: [HealthController],
    };
  }
}
