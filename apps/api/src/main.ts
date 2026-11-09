import { NestFactory } from '@nestjs/core';
import express from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { mountAuth } from '@dax/platform-core';
import { AppModule, authOptions, QUIET_PATHS } from './app/app.module';
import { loadEnv } from './env';
import { INSTALLED_MODULES } from './module-catalog';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule.forRoot(env), {
    bufferLogs: true,
    bodyParser: false,
  });
  const logger = app.get(Logger);
  app.useLogger(logger);

  app.use(helmet());
  app.getHttpAdapter().getInstance().disable('x-powered-by');
  mountAuth(app, {
    internalTokens: authOptions(env).internalTokens,
    openPaths: QUIET_PATHS,
  });
  app.use(express.json({ limit: '100kb' }));
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();

  await app.listen(env.API_PORT, env.API_HOST);
  logger.log(
    `API listening on ${env.API_HOST}:${env.API_PORT}. Installed modules: ${INSTALLED_MODULES.map((m) => m.key).join(', ')}`,
    'Bootstrap',
  );

  if (process.env['NX_READY_SIGNAL_SOCKET']) {
    try {
      const load = new Function('s', 'return import(s)') as (
        s: string,
      ) => Promise<{ emitReadySignal(server: unknown): boolean }>;
      (await load('@nx/js/ready-signal')).emitReadySignal(app.getHttpServer());
    } catch {
      // @nx/js not available outside the dev workspace
    }
  }
}

bootstrap().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
