import { Inject, Injectable, Logger } from '@nestjs/common';
import { OutboxStatus, PrismaService } from '@dax/platform-db';
import {
  errorMessage,
  InvalidEventPayloadError,
  oneLine,
  parsePayload,
} from './event';
import { HandlerRegistry } from './handler-registry';
import { WORKER_OPTIONS, type WorkerSettings } from './worker.options';

export interface ClaimedEvent {
  id: string;
  name: string;
  payload: unknown;
  attempts: number;
  created_at: Date;
}

export interface BatchResult {
  claimed: number;
  done: number;
  retried: number;
  failed: number;
}

const BASE_BACKOFF_SECONDS = 30;
const MAX_BACKOFF_SECONDS = 3600;

export function backoffSeconds(previousAttempts: number): number {
  return Math.min(
    BASE_BACKOFF_SECONDS * 2 ** Math.max(0, previousAttempts),
    MAX_BACKOFF_SECONDS,
  );
}

@Injectable()
export class OutboxProcessor {
  private readonly logger = new Logger('Outbox');

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: HandlerRegistry,
    @Inject(WORKER_OPTIONS) private readonly options: WorkerSettings,
  ) {}

  async processBatch(): Promise<BatchResult> {
    const rows = await this.claim();
    const result: BatchResult = {
      claimed: rows.length,
      done: 0,
      retried: 0,
      failed: 0,
    };
    for (const row of rows) {
      const outcome = await this.deliver(row);
      result[outcome] += 1;
    }
    return result;
  }

  // One statement: rows stay invisible to other workers for the lease, no long-held locks.
  private async claim(): Promise<ClaimedEvent[]> {
    const rows = await this.prisma.$queryRaw<ClaimedEvent[]>`
      UPDATE core.outbox_event o
         SET available_at = now() + make_interval(secs => ${this.options.leaseSeconds}::int)
        FROM (
          SELECT id FROM core.outbox_event
           WHERE status = 'PENDING' AND available_at <= now()
           ORDER BY created_at
           LIMIT ${this.options.batchSize}::int
           FOR UPDATE SKIP LOCKED
        ) due
       WHERE o.id = due.id
   RETURNING o.id, o.name, o.payload, o.attempts, o.created_at`;
    return [...rows].sort(
      (a, b) => a.created_at.getTime() - b.created_at.getTime(),
    );
  }

  private async deliver(
    row: ClaimedEvent,
  ): Promise<'done' | 'retried' | 'failed'> {
    const handlers = this.registry.handlersFor(row.name);
    const failures: string[] = [];
    for (const handler of handlers) {
      try {
        const payload = parsePayload(handler.event, row.payload);
        await this.prisma.$transaction(
          async (tx) => {
            const claimed = await tx.processedEvent.createMany({
              data: [{ eventId: row.id, handler: handler.id }],
              skipDuplicates: true,
            });
            if (claimed.count === 0) return;
            await handler.handle(payload, {
              eventId: row.id,
              name: row.name,
              occurredAt: row.created_at,
              tx,
            });
          },
          { timeout: this.options.handlerTimeoutSeconds * 1000 },
        );
      } catch (error) {
        if (error instanceof InvalidEventPayloadError) {
          return this.fail(row, `${handler.id}: ${errorMessage(error)}`, true);
        }
        failures.push(`${handler.id}: ${errorMessage(error)}`);
      }
    }
    if (failures.length > 0) return this.fail(row, failures.join(' | '), false);
    await this.prisma.outboxEvent.update({
      where: { id: row.id },
      data: {
        status: OutboxStatus.DONE,
        processedAt: new Date(),
        lastError: null,
      },
    });
    return 'done';
  }

  private async fail(
    row: ClaimedEvent,
    message: string,
    permanent: boolean,
  ): Promise<'retried' | 'failed'> {
    const attempts = row.attempts + 1;
    const failed = permanent || attempts >= this.options.maxAttempts;
    const lastError = oneLine(message);
    await this.prisma.outboxEvent.update({
      where: { id: row.id },
      data: {
        attempts,
        lastError,
        status: failed ? OutboxStatus.FAILED : OutboxStatus.PENDING,
        availableAt: new Date(Date.now() + backoffSeconds(row.attempts) * 1000),
      },
    });
    const log = {
      eventId: row.id,
      event: row.name,
      attempts,
      error: lastError,
    };
    if (failed) this.logger.error(log, 'Event delivery failed for good');
    else this.logger.warn(log, 'Event delivery failed, will retry');
    return failed ? 'failed' : 'retried';
  }
}
