import { type DynamicModule, Global, Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { CleanupJobs } from './cleanup.jobs';
import { EventBus } from './event-bus';
import { HandlerRegistry } from './handler-registry';
import { JobRunner } from './job.runner';
import { OutboxProcessor } from './outbox.processor';
import {
  WORKER_OPTIONS,
  type WorkerOptions,
  workerSettings,
} from './worker.options';
import { WorkerService } from './worker.service';

@Global()
@Module({
  imports: [DiscoveryModule],
  providers: [EventBus, HandlerRegistry],
  exports: [EventBus, HandlerRegistry],
})
export class EventsModule {}

@Module({})
export class WorkerModule {
  static forRoot(options: WorkerOptions = {}): DynamicModule {
    return {
      module: WorkerModule,
      imports: [EventsModule],
      providers: [
        { provide: WORKER_OPTIONS, useValue: workerSettings(options) },
        OutboxProcessor,
        JobRunner,
        WorkerService,
        CleanupJobs,
      ],
      exports: [WorkerService],
    };
  }
}
