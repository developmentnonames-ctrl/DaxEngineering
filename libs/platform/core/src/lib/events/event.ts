import { z } from 'zod';
import type { TransactionClient } from '@dax/platform-db';

export type EventName = `${string}.${string}.v${number}`;
export type EventSchema = z.ZodType<Record<string, unknown>>;

export interface EventDef<
  N extends EventName = EventName,
  S extends EventSchema = EventSchema,
> {
  readonly name: N;
  readonly schema: S;
}

export type EventPayload<E extends EventDef> = z.output<E['schema']>;
export type EventInput<E extends EventDef> = z.input<E['schema']>;

export interface EventContext {
  eventId: string;
  name: string;
  occurredAt: Date;
  tx: TransactionClient;
}

const EVENT_NAME = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*\.v[1-9][0-9]*$/;

export function defineEvent<const N extends EventName, S extends EventSchema>(
  name: N,
  schema: S,
): EventDef<N, S> {
  if (!EVENT_NAME.test(name)) {
    throw new Error(
      `Event name "${name}" must look like <module>.<thing>.v<N>`,
    );
  }
  return Object.freeze({ name, schema });
}

export class InvalidEventPayloadError extends Error {
  constructor(event: string, issues: readonly z.core.$ZodIssue[]) {
    const where = issues
      .slice(0, 5)
      .map((i) => `${i.path.map(String).join('.') || '(root)'}: ${i.code}`)
      .join('; ');
    super(`Invalid ${event} payload (${where})`);
    this.name = 'InvalidEventPayloadError';
  }
}

export function parsePayload<E extends EventDef>(
  event: E,
  value: unknown,
): EventPayload<E> {
  const result = event.schema.safeParse(value);
  if (!result.success) {
    throw new InvalidEventPayloadError(event.name, result.error.issues);
  }
  return result.data as EventPayload<E>;
}

const MAX_ERROR_LENGTH = 500;

export function oneLine(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length > MAX_ERROR_LENGTH
    ? `${line.slice(0, MAX_ERROR_LENGTH - 1)}…`
    : line;
}

export function errorMessage(error: unknown): string {
  return oneLine(
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : 'Unknown error',
  );
}
