import { DynamicModule, Module } from '@nestjs/common';
import { createLoggerModule } from '@dax/platform-core';
import { DatabaseModule } from '@dax/platform-db';
import type { Env } from '../env';
import { HealthController } from './health/health.controller';

export const QUIET_PATHS = ['/api/health/live', '/api/health/ready'];

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
      ],
      controllers: [HealthController],
    };
  }
}
