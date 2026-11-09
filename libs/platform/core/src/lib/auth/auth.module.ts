import {
  type DynamicModule,
  type INestApplication,
  Logger,
  Module,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { toNodeHandler } from 'better-auth/node';
import type { Express, Request, Response } from 'express';
import { APP_NAMES } from '@dax/platform-contract';
import { AdminUsersController } from './admin-users.controller';
import { AUTH_OPTIONS, type AuthOptions, AuthService } from './auth.service';
import { type DaxRequest, internalCaller } from './internal-caller';
import { MeController } from './me.controller';
import { SessionGuard } from './session.guard';

@Module({})
export class AuthModule {
  static forRoot(options: AuthOptions): DynamicModule {
    return {
      module: AuthModule,
      providers: [
        { provide: AUTH_OPTIONS, useValue: options },
        AuthService,
        { provide: APP_GUARD, useClass: SessionGuard },
      ],
      controllers: [MeController, AdminUsersController],
      exports: [AuthService],
    };
  }
}

export function mountAuth(
  app: INestApplication,
  options: {
    internalTokens: AuthOptions['internalTokens'];
    openPaths: string[];
  },
): void {
  const http = app.getHttpAdapter().getInstance() as Express;
  const auth = app.get(AuthService);
  const logger = new Logger('Auth');
  const handlers = Object.fromEntries(
    APP_NAMES.map((name) => [name, toNodeHandler(auth.instances[name])]),
  );

  http.use(
    internalCaller({
      tokens: options.internalTokens,
      openPaths: options.openPaths,
    }),
  );
  http.all('/api/auth/{*path}', (req: Request, res: Response) => {
    const name = (req as DaxRequest).daxApp;
    if (!name) {
      res.status(401).end();
      return;
    }
    handlers[name](req, res).catch((error: unknown) => {
      logger.error(
        { err: error instanceof Error ? error.message : String(error) },
        'Auth handler failed',
      );
      if (!res.headersSent) res.status(500).end();
    });
  });
}
