import {
  type DynamicModule,
  type INestApplication,
  Logger,
  Module,
  type Provider,
  type Type,
} from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR, DiscoveryModule } from '@nestjs/core';
import { toNodeHandler } from 'better-auth/node';
import type { Express, Request, Response } from 'express';
import { ClsModule } from 'nestjs-cls';
import { APP_NAMES } from '@dax/platform-contract';
import { PLATFORM_ENTITIES } from './acm/platform-entities';
import { ADMIN_CONTROLLERS } from './admin';
import { ApprovalsService } from './approvals/approvals.service';
import {
  FieldCrypto,
  fieldCryptoProvider,
  type FieldCryptoOptions,
} from './crypto/field-crypto';
import { IdempotencyInterceptor } from './idempotency/idempotency.interceptor';
import { EventsModule } from './events';
import {
  AttachmentAccessRegistry,
  AttachmentsController,
  FilesService,
  type FilesOptions,
  filesProviders,
} from './files';
import { NumberingService } from './numbering/numbering.service';
import { PolicyService } from './acm/policy.service';
import type { Catalog } from './acm/registry';
import { PLATFORM_CATALOG, RegistryService } from './acm/registry.service';
import { AuditService, ENTITY_DEFS } from './audit/audit.service';
import { RequestContext } from './context/request-context';
import { requestIdFor } from './logging';
import {
  AUTH_OPTIONS,
  type AuthOptions,
  AuthService,
} from './auth/auth.service';
import { type DaxRequest, internalCaller } from './auth/internal-caller';
import { DirectoryController } from './auth/directory.controller';
import { MeController } from './auth/me.controller';
import { SessionGuard } from './auth/session.guard';

export interface PlatformOptions {
  auth: AuthOptions;
  catalog: Catalog;
  crypto: FieldCryptoOptions;
  files?: FilesOptions;
  providers?: Provider[];
  controllers?: Type<unknown>[];
}

export const PUBLIC_ORIGINS = Symbol.for('dax.platform-core.public-origins');
export type PublicOrigins = Record<'web' | 'admin', string>;

@Module({})
export class PlatformModule {
  static forRoot(options: PlatformOptions): DynamicModule {
    const entities = [...PLATFORM_ENTITIES, ...options.catalog.entities];
    return {
      module: PlatformModule,
      global: true,
      imports: [
        DiscoveryModule,
        EventsModule,
        ClsModule.forRoot({
          global: true,
          middleware: {
            mount: true,
            generateId: true,
            idGenerator: (req: Request) => requestIdFor(req),
            setup: (cls, req: Request) => {
              const ip = req.headers['x-dax-client-ip'];
              cls.set('requestId', cls.getId());
              cls.set('ip', typeof ip === 'string' ? ip : null);
            },
          },
        }),
      ],
      providers: [
        { provide: AUTH_OPTIONS, useValue: options.auth },
        { provide: PUBLIC_ORIGINS, useValue: { ...options.auth.origins } },
        {
          provide: PLATFORM_CATALOG,
          useValue: { modules: options.catalog.modules, entities },
        },
        { provide: ENTITY_DEFS, useValue: entities },
        RequestContext,
        PolicyService,
        AuditService,
        RegistryService,
        AuthService,
        { provide: APP_GUARD, useClass: SessionGuard },
        { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
        fieldCryptoProvider(options.crypto),
        NumberingService,
        ApprovalsService,
        ...filesProviders(options.files),
        ...(options.providers ?? []),
      ],
      controllers: [
        MeController,
        DirectoryController,
        ...ADMIN_CONTROLLERS,
        AttachmentsController,
        ...(options.controllers ?? []),
      ],
      exports: [
        PUBLIC_ORIGINS,
        AuthService,
        PolicyService,
        AuditService,
        RequestContext,
        RegistryService,
        FieldCrypto,
        NumberingService,
        ApprovalsService,
        AttachmentAccessRegistry,
        FilesService,
      ],
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
