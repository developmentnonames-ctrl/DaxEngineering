import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app/app.module';
import { loadEnv } from './env';
import { INSTALLED_MODULES } from './module-catalog';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule.forRoot(env), {
    bufferLogs: true,
  });
  const logger = app.get(Logger);
  app.useLogger(logger);

  app.use(helmet());
  app.getHttpAdapter().getInstance().disable('x-powered-by');
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
