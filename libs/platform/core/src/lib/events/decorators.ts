import type { TransactionClient } from '@dax/platform-db';
import type { EventContext, EventDef, EventPayload } from './event';

export const SUBSCRIBE_METADATA = Symbol.for(
  'dax.platform-core.events.subscribe',
);
export const SCHEDULED_METADATA = Symbol.for(
  'dax.platform-core.events.scheduled',
);

export type EventHandlerFn<E extends EventDef> = (
  payload: EventPayload<E>,
  ctx: EventContext,
) => Promise<void> | void;

export interface ScheduledOptions {
  name: string;
  everySeconds: number;
  timeoutSeconds?: number;
}

export interface JobContext {
  name: string;
  tx: TransactionClient;
  now: Date;
  lastRunAt: Date | null;
}

export type JobHandlerFn = (ctx: JobContext) => Promise<void> | void;

const JOB_NAME = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

function ownList<T>(key: symbol, target: object): T[] {
  const existing = Reflect.getOwnMetadata(key, target) as T[] | undefined;
  if (existing) return existing;
  const list: T[] = [];
  Reflect.defineMetadata(key, list, target);
  return list;
}

export function Subscribe<E extends EventDef>(event: E) {
  return <T extends EventHandlerFn<E>>(
    _target: object,
    _key: string | symbol,
    descriptor: TypedPropertyDescriptor<T>,
  ): void => {
    if (!descriptor.value)
      throw new Error('@Subscribe() must decorate a method');
    ownList<EventDef>(SUBSCRIBE_METADATA, descriptor.value).push(event);
  };
}

export function Scheduled(options: ScheduledOptions) {
  if (!JOB_NAME.test(options.name)) {
    throw new Error(`Job name "${options.name}" must look like <module>.<job>`);
  }
  if (!Number.isInteger(options.everySeconds) || options.everySeconds < 1) {
    throw new Error(
      `Job "${options.name}" needs a whole everySeconds of 1 or more`,
    );
  }
  return <T extends JobHandlerFn>(
    _target: object,
    _key: string | symbol,
    descriptor: TypedPropertyDescriptor<T>,
  ): void => {
    if (!descriptor.value)
      throw new Error('@Scheduled() must decorate a method');
    Reflect.defineMetadata(SCHEDULED_METADATA, options, descriptor.value);
  };
}

export function subscriptionsOf(method: object): readonly EventDef[] {
  return (
    (Reflect.getOwnMetadata(SUBSCRIBE_METADATA, method) as
      EventDef[] | undefined) ?? []
  );
}

export function scheduleOf(method: object): ScheduledOptions | undefined {
  return Reflect.getOwnMetadata(SCHEDULED_METADATA, method) as
    ScheduledOptions | undefined;
}
