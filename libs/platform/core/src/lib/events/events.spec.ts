import { Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { PrismaService, TransactionClient } from '@dax/platform-db';
import {
  CLEANUP_BATCH_SIZE,
  CLEANUP_MAX_BATCHES,
  CleanupJobs,
} from './cleanup.jobs';
import { type JobContext, Scheduled, Subscribe } from './decorators';
import {
  defineEvent,
  type EventContext,
  type EventDef,
  type EventName,
  errorMessage,
} from './event';
import { EventBus } from './event-bus';
import { EventsModule } from './events.module';
import {
  type EventHandler,
  HandlerRegistry,
  type ScheduledJob,
} from './handler-registry';
import { JobRunner } from './job.runner';
import {
  backoffSeconds,
  type ClaimedEvent,
  OutboxProcessor,
} from './outbox.processor';
import { workerSettings } from './worker.options';
import { WorkerService } from './worker.service';

const GoodsReceived = defineEvent(
  'inventory.goods_received.v1',
  z.object({ grnId: z.uuid(), lines: z.number().int().min(1) }),
);
const GRN_ID = '0192f7a0-0000-7000-8000-000000000001';

function asTx(fake: object): TransactionClient {
  return fake as unknown as TransactionClient;
}

function asPrisma(fake: object): PrismaService {
  return fake as unknown as PrismaService;
}

describe('defineEvent', () => {
  it('accepts <module>.<thing>.v<N> names only', () => {
    expect(GoodsReceived.name).toBe('inventory.goods_received.v1');
    for (const bad of [
      'Inventory.x.v1',
      'inventory.x',
      'inventory.x.v0',
      'a.b.c.v1',
    ]) {
      expect(() => defineEvent(bad as EventName, z.object({}))).toThrow(
        /must look like/,
      );
    }
  });
});

describe('EventBus.publish', () => {
  function fakeTx() {
    const create = vi.fn(async (args: { data: { name: string } }) => ({
      id: 'evt-1',
      name: args.data.name,
    }));
    return { tx: asTx({ outboxEvent: { create } }), create };
  }

  it('writes a validated outbox row in the caller transaction', async () => {
    const { tx, create } = fakeTx();
    const id = await new EventBus().publish(tx, GoodsReceived, {
      grnId: GRN_ID,
      lines: 3,
    });
    expect(id).toBe('evt-1');
    expect(create).toHaveBeenCalledWith({
      data: {
        name: 'inventory.goods_received.v1',
        payload: { grnId: GRN_ID, lines: 3 },
      },
      select: { id: true },
    });
  });

  it('rejects an invalid payload without naming its values', async () => {
    const { tx, create } = fakeTx();
    const error = await new EventBus()
      .publish(tx, GoodsReceived, { grnId: 'secret-value', lines: 0 })
      .catch((e: unknown) => e);
    expect(errorMessage(error)).toMatch(
      /grnId: invalid_format; lines: too_small/,
    );
    expect(errorMessage(error)).not.toContain('secret-value');
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects payloads that would not survive JSON storage', async () => {
    const Dated = defineEvent('core.dated.v1', z.object({ at: z.date() }));
    const { tx, create } = fakeTx();
    await expect(
      new EventBus().publish(tx, Dated, { at: new Date() }),
    ).rejects.toThrow(/Invalid core.dated.v1 payload/);
    expect(create).not.toHaveBeenCalled();
  });
});

@Injectable()
class StockListener {
  readonly seen: string[] = [];

  @Subscribe(GoodsReceived)
  async onReceived(payload: { grnId: string }): Promise<void> {
    this.seen.push(payload.grnId);
  }

  @Scheduled({ name: 'inventory.hold_expiry', everySeconds: 60 })
  async sweep(): Promise<void> {
    this.seen.push('sweep');
  }

  helper(): void {
    this.seen.push('helper');
  }
}

describe('HandlerRegistry discovery', () => {
  it('collects @Subscribe and @Scheduled methods as ClassName.method', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [EventsModule],
      providers: [StockListener],
    }).compile();
    await moduleRef.init();
    const registry = moduleRef.get(HandlerRegistry);

    const handlers = registry.handlersFor(GoodsReceived.name);
    expect(handlers.map((h) => h.id)).toEqual(['StockListener.onReceived']);
    expect(registry.scheduledJobs()).toMatchObject([
      {
        id: 'StockListener.sweep',
        name: 'inventory.hold_expiry',
        everySeconds: 60,
        timeoutSeconds: 60,
      },
    ]);
    await handlers[0]?.handle({ grnId: GRN_ID }, {} as EventContext);
    expect(moduleRef.get(StockListener).seen).toEqual([GRN_ID]);
    await moduleRef.close();
  });

  it('rejects duplicate job names and clashing event definitions', () => {
    const registry = new HandlerRegistry(
      {} as ConstructorParameters<typeof HandlerRegistry>[0],
      {} as ConstructorParameters<typeof HandlerRegistry>[1],
    );
    const job = {
      id: 'A.run',
      name: 'core.x',
      everySeconds: 1,
      timeoutSeconds: 1,
      run: vi.fn(),
    };
    expect(() =>
      registry.load({ handlers: [], jobs: [job, { ...job, id: 'B.run' }] }),
    ).toThrow(/Duplicate scheduled job/);
    const twin = defineEvent(GoodsReceived.name, z.object({}));
    const h = (id: string, event: EventDef = GoodsReceived): EventHandler => ({
      id,
      event,
      handle: vi.fn(),
    });
    expect(() =>
      registry.load({ handlers: [h('A.on'), h('B.on', twin)], jobs: [] }),
    ).toThrow(/defined more than once/);
  });
});

interface Row {
  id: string;
  name: string;
  payload: unknown;
  attempts: number;
  status: string;
  availableAt: Date;
  lastError: string | null;
  createdAt: Date;
}

function fakeOutboxDb(rows: Row[]) {
  const processed = new Set<string>();
  const tx = {
    processedEvent: {
      createMany: vi.fn(
        async ({ data }: { data: { eventId: string; handler: string }[] }) => {
          let count = 0;
          for (const d of data) {
            const key = `${d.eventId}|${d.handler}`;
            if (!processed.has(key)) {
              processed.add(key);
              count++;
            }
          }
          return { count };
        },
      ),
    },
  };
  const prisma = {
    $queryRaw: vi.fn(async (): Promise<ClaimedEvent[]> => {
      const now = Date.now();
      return rows
        .filter((r) => r.status === 'PENDING' && r.availableAt.getTime() <= now)
        .map((r) => {
          r.availableAt = new Date(now + 300_000);
          return {
            id: r.id,
            name: r.name,
            payload: r.payload,
            attempts: r.attempts,
            created_at: r.createdAt,
          };
        });
    }),
    $transaction: vi.fn(
      async <T>(fn: (t: typeof tx) => Promise<T>): Promise<T> => {
        const snapshot = new Set(processed);
        try {
          return await fn(tx);
        } catch (error) {
          processed.clear();
          for (const key of snapshot) processed.add(key);
          throw error;
        }
      },
    ),
    outboxEvent: {
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<Row>;
        }) => {
          const row = rows.find((r) => r.id === where.id);
          if (row) Object.assign(row, data);
          return row;
        },
      ),
    },
  };
  return { prisma, processed };
}

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: 'evt-1',
    name: GoodsReceived.name,
    payload: { grnId: GRN_ID, lines: 2 },
    attempts: 0,
    status: 'PENDING',
    availableAt: new Date(0),
    lastError: null,
    createdAt: new Date('2026-11-09T00:00:00Z'),
    ...overrides,
  };
}

function processorWith(rows: Row[], handlers: EventHandler[]) {
  const db = fakeOutboxDb(rows);
  const registry = new HandlerRegistry(
    {} as ConstructorParameters<typeof HandlerRegistry>[0],
    {} as ConstructorParameters<typeof HandlerRegistry>[1],
  );
  registry.load({ handlers, jobs: [] });
  const processor = new OutboxProcessor(
    asPrisma(db.prisma),
    registry,
    workerSettings(),
  );
  return { processor, db };
}

function handler(
  id: string,
  impl: (payload: unknown, ctx: EventContext) => Promise<void>,
) {
  return {
    id,
    event: GoodsReceived,
    handle: vi.fn(impl),
  } satisfies EventHandler;
}

describe('OutboxProcessor', () => {
  it('runs every handler once and marks the event done', async () => {
    const rows = [row()];
    const a = handler('A.on', async () => undefined);
    const b = handler('B.on', async () => undefined);
    const { processor } = processorWith(rows, [a, b]);

    expect(await processor.processBatch()).toEqual({
      claimed: 1,
      done: 1,
      retried: 0,
      failed: 0,
    });
    expect(a.handle).toHaveBeenCalledWith(
      { grnId: GRN_ID, lines: 2 },
      expect.objectContaining({ eventId: 'evt-1', name: GoodsReceived.name }),
    );
    expect(rows[0]).toMatchObject({ status: 'DONE', lastError: null });
    expect(await processor.processBatch()).toMatchObject({ claimed: 0 });
  });

  it('retries only the failed handler with backoff and a value-free error', async () => {
    const rows = [row()];
    const ok = handler('A.on', async () => undefined);
    let fail = true;
    const flaky = handler('B.on', async () => {
      if (fail) throw new Error('stock row locked');
    });
    const { processor } = processorWith(rows, [ok, flaky]);

    const before = Date.now();
    expect(await processor.processBatch()).toMatchObject({ retried: 1 });
    expect(rows[0]).toMatchObject({
      status: 'PENDING',
      attempts: 1,
      lastError: 'B.on: Error: stock row locked',
    });
    expect(rows[0]?.lastError).not.toContain(GRN_ID);
    expect(rows[0]?.availableAt.getTime()).toBeGreaterThanOrEqual(
      before + 30_000,
    );

    fail = false;
    if (rows[0]) rows[0].availableAt = new Date(0);
    expect(await processor.processBatch()).toMatchObject({ done: 1 });
    expect(ok.handle).toHaveBeenCalledTimes(1);
    expect(flaky.handle).toHaveBeenCalledTimes(2);
  });

  it('gives up after the tenth attempt', async () => {
    const rows = [row({ attempts: 9 })];
    const { processor } = processorWith(rows, [
      handler('A.on', async () => {
        throw new Error('x'.repeat(2000));
      }),
    ]);
    expect(await processor.processBatch()).toMatchObject({ failed: 1 });
    expect(rows[0]?.status).toBe('FAILED');
    expect(rows[0]?.attempts).toBe(10);
    expect(rows[0]?.lastError?.length).toBeLessThanOrEqual(500);
  });

  it('fails an event whose stored payload breaks the schema without calling handlers', async () => {
    const rows = [row({ payload: { grnId: 'not-a-uuid', lines: 1 } })];
    const a = handler('A.on', async () => undefined);
    const { processor } = processorWith(rows, [a]);
    expect(await processor.processBatch()).toMatchObject({ failed: 1 });
    expect(a.handle).not.toHaveBeenCalled();
    expect(rows[0]?.lastError).toBe(
      'A.on: InvalidEventPayloadError: Invalid inventory.goods_received.v1 payload (grnId: invalid_format)',
    );
  });

  it('completes events nobody subscribes to', async () => {
    const rows = [row({ name: 'parties.unknown.v1' })];
    const { processor } = processorWith(rows, []);
    expect(await processor.processBatch()).toMatchObject({ done: 1 });
    expect(rows[0]?.status).toBe('DONE');
  });

  it('backs off exponentially up to an hour', () => {
    expect([0, 1, 2, 6, 7, 9].map(backoffSeconds)).toEqual([
      30, 60, 120, 1920, 3600, 3600,
    ]);
  });
});

function fakeJobDb(options: { locked: boolean; lastRunAt?: Date }) {
  const runs = new Map<
    string,
    { lastRunAt: Date; lastStatus: string; lastError: string | null }
  >();
  if (options.lastRunAt) {
    runs.set('core.test', {
      lastRunAt: options.lastRunAt,
      lastStatus: 'OK',
      lastError: null,
    });
  }
  const jobRun = {
    findUnique: vi.fn(
      async ({ where }: { where: { name: string } }) =>
        runs.get(where.name) ?? null,
    ),
    upsert: vi.fn(
      async ({
        where,
        update,
      }: {
        where: { name: string };
        update: {
          lastRunAt: Date;
          lastStatus: string;
          lastError: string | null;
        };
      }) => {
        runs.set(where.name, update);
      },
    ),
  };
  const tx = {
    $queryRaw: vi.fn(
      async (strings: TemplateStringsArray, ...values: unknown[]) => {
        expect(strings.join('?')).toContain(
          'pg_try_advisory_xact_lock(hashtext(?))',
        );
        expect(values).toEqual(['core.test']);
        return [{ locked: options.locked }];
      },
    ),
    jobRun,
  };
  const prisma = {
    $transaction: vi.fn(async <T>(fn: (t: typeof tx) => Promise<T>) => fn(tx)),
    jobRun,
  };
  return { prisma, runs };
}

function job(run: (ctx: JobContext) => Promise<void>): ScheduledJob {
  return {
    id: 'T.run',
    name: 'core.test',
    everySeconds: 60,
    timeoutSeconds: 10,
    run: vi.fn(run),
  };
}

function runnerWith(db: ReturnType<typeof fakeJobDb>, jobs: ScheduledJob[]) {
  const registry = new HandlerRegistry(
    {} as ConstructorParameters<typeof HandlerRegistry>[0],
    {} as ConstructorParameters<typeof HandlerRegistry>[1],
  );
  registry.load({ handlers: [], jobs });
  return new JobRunner(asPrisma(db.prisma), registry);
}

describe('JobRunner', () => {
  const now = new Date('2026-11-09T10:00:00Z').getTime();

  it('runs a due job under the advisory lock and records the run', async () => {
    const db = fakeJobDb({ locked: true });
    const j = job(async () => undefined);
    const runner = runnerWith(db, [j]);
    expect(await runner.tick(now)).toEqual({ 'core.test': 'ran' });
    expect(db.runs.get('core.test')).toMatchObject({
      lastStatus: 'OK',
      lastError: null,
    });
    expect(await runner.tick(now + 30_000)).toEqual({});
    expect(j.run).toHaveBeenCalledTimes(1);
  });

  it('skips when another worker holds the lock or the job ran recently', async () => {
    const busy = runnerWith(fakeJobDb({ locked: false }), [
      job(async () => undefined),
    ]);
    expect(await busy.tick(now)).toEqual({ 'core.test': 'busy' });

    const recent = fakeJobDb({
      locked: true,
      lastRunAt: new Date(now - 10_000),
    });
    const j = job(async () => undefined);
    const runner = runnerWith(recent, [j]);
    expect(await runner.tick(now)).toEqual({ 'core.test': 'not-due' });
    expect(await runner.tick(now + 40_000)).toEqual({});
    expect(await runner.tick(now + 50_000)).toEqual({ 'core.test': 'ran' });
    expect(j.run).toHaveBeenCalledTimes(1);
  });

  it('records a failure with its message', async () => {
    const db = fakeJobDb({ locked: true });
    const runner = runnerWith(db, [
      job(async () => {
        throw new Error('sweep broke');
      }),
    ]);
    expect(await runner.tick(now)).toEqual({ 'core.test': 'failed' });
    expect(db.runs.get('core.test')).toMatchObject({
      lastStatus: 'FAILED',
      lastError: 'Error: sweep broke',
    });
  });
});

describe('CleanupJobs', () => {
  it('deletes old rows in bounded batches per table', async () => {
    const calls: { sql: string; before: Date }[] = [];
    const remaining = {
      outbox_event: CLEANUP_BATCH_SIZE * 30,
      processed_event: 1500,
      idempotency_key: 10,
    };
    const tx = {
      $executeRaw: vi.fn(
        async (strings: TemplateStringsArray, before: Date) => {
          const sql = strings.join('?');
          const table = (
            Object.keys(remaining) as (keyof typeof remaining)[]
          ).find((t) => sql.includes(`DELETE FROM core.${t}`));
          if (!table) throw new Error('unexpected sql');
          calls.push({ sql: table, before });
          const n = Math.min(remaining[table], CLEANUP_BATCH_SIZE);
          remaining[table] -= n;
          return n;
        },
      ),
    };
    const now = new Date('2026-11-09T00:00:00Z');
    await new CleanupJobs().cleanup({
      name: 'core.cleanup',
      tx: asTx(tx),
      now,
      lastRunAt: null,
    });

    const count = (t: string) => calls.filter((c) => c.sql === t).length;
    expect(count('outbox_event')).toBe(CLEANUP_MAX_BATCHES);
    expect(count('processed_event')).toBe(2);
    expect(count('idempotency_key')).toBe(1);
    expect(
      calls.find((c) => c.sql === 'outbox_event')?.before.toISOString(),
    ).toBe('2026-10-10T00:00:00.000Z');
    expect(
      calls.find((c) => c.sql === 'idempotency_key')?.before.toISOString(),
    ).toBe('2026-11-07T00:00:00.000Z');
  });
});

describe('WorkerService', () => {
  it('polls until stopped and stops promptly while idle', async () => {
    const processBatch = vi.fn(async () => ({
      claimed: 0,
      done: 0,
      retried: 0,
      failed: 0,
    }));
    const tick = vi.fn(async () => ({}));
    const worker = new WorkerService(
      { processBatch } as unknown as OutboxProcessor,
      { tick } as unknown as JobRunner,
      workerSettings({ pollIntervalMs: 60_000 }),
    );
    worker.start();
    await vi.waitFor(() => expect(tick).toHaveBeenCalledTimes(1));
    const started = Date.now();
    await worker.stop();
    expect(Date.now() - started).toBeLessThan(1000);
    expect(processBatch).toHaveBeenCalledTimes(1);
  });

  it('keeps going after a failed cycle and drains full batches without sleeping', async () => {
    let calls = 0;
    const processBatch = vi.fn(async () => {
      calls++;
      if (calls === 1) throw new Error('db down');
      return { claimed: calls < 4 ? 20 : 0, done: 0, retried: 0, failed: 0 };
    });
    const worker = new WorkerService(
      { processBatch } as unknown as OutboxProcessor,
      { tick: vi.fn(async () => ({})) } as unknown as JobRunner,
      workerSettings({ pollIntervalMs: 5 }),
    );
    worker.start();
    await vi.waitFor(() =>
      expect(processBatch.mock.calls.length).toBeGreaterThanOrEqual(5),
    );
    await worker.stop();
  });
});
