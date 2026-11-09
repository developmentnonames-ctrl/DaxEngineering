import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { InventoryJobsModule } from '@dax/inventory-server';
import { WorkerService } from '@dax/platform-core';
import { loadWorkerEnv, WorkerAppModule } from './worker.module';

async function bootstrap(): Promise<void> {
  const env = loadWorkerEnv();
  const app = await NestFactory.createApplicationContext(
    WorkerAppModule.forRoot(env, [InventoryJobsModule]),
    { bufferLogs: true },
  );
  const logger = app.get(Logger);
  app.useLogger(logger);
  const worker = app.get(WorkerService);

  let closing = false;
  const shutdown = (signal: NodeJS.Signals): void => {
    if (closing) return;
    closing = true;
    logger.log(`Received ${signal}, stopping worker`, 'Bootstrap');
    worker
      .stop()
      .then(() => app.close())
      .then(
        () => process.exit(0),
        (err: unknown) => {
          console.error(err instanceof Error ? err.message : err);
          process.exit(1);
        },
      );
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  worker.start();
}

bootstrap().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
