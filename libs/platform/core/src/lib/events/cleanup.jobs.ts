import { Injectable } from '@nestjs/common';
import type { TransactionClient } from '@dax/platform-db';
import { type JobContext, Scheduled } from './decorators';

export const CLEANUP_BATCH_SIZE = 1000;
export const CLEANUP_MAX_BATCHES = 10;

const DAY_MS = 24 * 60 * 60 * 1000;

type BatchDelete = (tx: TransactionClient, before: Date) => Promise<number>;

const deleteDoneEvents: BatchDelete = (tx, before) => tx.$executeRaw`
  DELETE FROM core.outbox_event WHERE id IN (
    SELECT id FROM core.outbox_event
     WHERE status = 'DONE' AND processed_at < ${before}
     LIMIT ${CLEANUP_BATCH_SIZE}::int)`;

const deleteProcessedMarks: BatchDelete = (tx, before) => tx.$executeRaw`
  DELETE FROM core.processed_event WHERE (event_id, handler) IN (
    SELECT event_id, handler FROM core.processed_event
     WHERE processed_at < ${before}
     LIMIT ${CLEANUP_BATCH_SIZE}::int)`;

const deleteIdempotencyKeys: BatchDelete = (tx, before) => tx.$executeRaw`
  DELETE FROM core.idempotency_key WHERE (user_id, key) IN (
    SELECT user_id, key FROM core.idempotency_key
     WHERE created_at < ${before}
     LIMIT ${CLEANUP_BATCH_SIZE}::int)`;

async function inBatches(
  tx: TransactionClient,
  before: Date,
  remove: BatchDelete,
): Promise<number> {
  let total = 0;
  for (let i = 0; i < CLEANUP_MAX_BATCHES; i++) {
    const count = await remove(tx, before);
    total += count;
    if (count < CLEANUP_BATCH_SIZE) break;
  }
  return total;
}

@Injectable()
export class CleanupJobs {
  @Scheduled({
    name: 'core.cleanup',
    everySeconds: 15 * 60,
    timeoutSeconds: 120,
  })
  async cleanup({ tx, now }: JobContext): Promise<void> {
    const monthAgo = new Date(now.getTime() - 30 * DAY_MS);
    await inBatches(tx, monthAgo, deleteDoneEvents);
    await inBatches(tx, monthAgo, deleteProcessedMarks);
    await inBatches(
      tx,
      new Date(now.getTime() - 2 * DAY_MS),
      deleteIdempotencyKeys,
    );
  }
}
