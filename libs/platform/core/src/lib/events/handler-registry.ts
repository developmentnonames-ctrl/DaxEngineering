import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { DiscoveryService, MetadataScanner } from '@nestjs/core';
import type { EventContext, EventDef } from './event';
import {
  type JobContext,
  type ScheduledOptions,
  scheduleOf,
  subscriptionsOf,
} from './decorators';

export interface EventHandler {
  id: string;
  event: EventDef;
  handle(payload: unknown, ctx: EventContext): Promise<void>;
}

export interface ScheduledJob extends Required<ScheduledOptions> {
  id: string;
  run(ctx: JobContext): Promise<void>;
}

const DEFAULT_JOB_TIMEOUT_SECONDS = 60;

type Method = (...args: unknown[]) => unknown;

@Injectable()
export class HandlerRegistry implements OnModuleInit {
  private readonly logger = new Logger('Events');
  private handlers = new Map<string, EventHandler[]>();
  private jobs: ScheduledJob[] = [];

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly scanner: MetadataScanner,
  ) {}

  onModuleInit(): void {
    this.load(this.discover());
    this.logger.log(
      {
        events: this.handlers.size,
        handlers: this.allHandlers().length,
        jobs: this.jobs.length,
      },
      'Event subscribers discovered',
    );
  }

  handlersFor(name: string): readonly EventHandler[] {
    return this.handlers.get(name) ?? [];
  }

  allHandlers(): readonly EventHandler[] {
    return [...this.handlers.values()].flat();
  }

  scheduledJobs(): readonly ScheduledJob[] {
    return this.jobs;
  }

  load(found: { handlers: EventHandler[]; jobs: ScheduledJob[] }): void {
    const handlers = new Map<string, EventHandler[]>();
    const seen = new Set<string>();
    for (const handler of found.handlers) {
      const key = `${handler.event.name} ${handler.id}`;
      if (seen.has(key)) {
        throw new Error(
          `Duplicate subscriber ${handler.id} for ${handler.event.name}`,
        );
      }
      seen.add(key);
      const list = handlers.get(handler.event.name) ?? [];
      if (list.length > 0 && list[0].event.schema !== handler.event.schema) {
        throw new Error(
          `Event ${handler.event.name} is defined more than once`,
        );
      }
      handlers.set(handler.event.name, [...list, handler]);
    }
    const names = new Set<string>();
    for (const job of found.jobs) {
      if (names.has(job.name))
        throw new Error(`Duplicate scheduled job ${job.name}`);
      names.add(job.name);
    }
    this.handlers = handlers;
    this.jobs = found.jobs;
  }

  private discover(): { handlers: EventHandler[]; jobs: ScheduledJob[] } {
    const handlers: EventHandler[] = [];
    const jobs: ScheduledJob[] = [];
    for (const wrapper of this.discovery.getProviders()) {
      const instance = wrapper.instance as Record<string, unknown> | undefined;
      if (!instance || typeof instance !== 'object') continue;
      const proto = Object.getPrototypeOf(instance) as object | null;
      if (!proto) continue;
      const className = instance.constructor.name;
      for (const methodName of this.scanner.getAllMethodNames(proto)) {
        const method = (proto as Record<string, unknown>)[methodName];
        if (typeof method !== 'function') continue;
        const events = subscriptionsOf(method);
        const schedule = scheduleOf(method);
        if (events.length === 0 && !schedule) continue;
        const id = `${className}.${methodName}`;
        if (!wrapper.isDependencyTreeStatic()) {
          throw new Error(`${id} must live in a singleton provider`);
        }
        const call = (method as Method).bind(instance);
        for (const event of events) {
          handlers.push({
            id,
            event,
            handle: async (payload, ctx) => {
              await call(payload, ctx);
            },
          });
        }
        if (schedule) {
          jobs.push({
            id,
            name: schedule.name,
            everySeconds: schedule.everySeconds,
            timeoutSeconds:
              schedule.timeoutSeconds ?? DEFAULT_JOB_TIMEOUT_SECONDS,
            run: async (ctx) => {
              await call(ctx);
            },
          });
        }
      }
    }
    return { handlers, jobs };
  }
}
