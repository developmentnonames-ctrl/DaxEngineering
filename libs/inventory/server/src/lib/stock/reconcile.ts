import { Injectable, Logger } from '@nestjs/common';
import { type JobContext, Scheduled } from '@dax/platform-core';
import type { TransactionClient } from '@dax/platform-db';

export interface Mismatch {
  check: 'bins_vs_balance' | 'ledger_vs_bin' | 'buckets';
  itemId: string;
  binId: string | null;
  expected: string;
  actual: string;
}

export async function findMismatches(
  tx: TransactionClient,
): Promise<Mismatch[]> {
  const binsVsBalance = await tx.$queryRaw<
    { item_id: string; expected: string; actual: string }[]
  >`
    SELECT sb.item_id, coalesce(sum(bs.qty), 0)::text AS expected, sb.on_hand::text AS actual
    FROM inventory.stock_balance sb
    LEFT JOIN inventory.bin b ON b.store_id = sb.store_id
    LEFT JOIN inventory.bin_stock bs ON bs.bin_id = b.id AND bs.item_id = sb.item_id
    GROUP BY sb.store_id, sb.item_id, sb.on_hand
    HAVING coalesce(sum(bs.qty), 0) <> sb.on_hand`;

  const ledgerVsBin = await tx.$queryRaw<
    { item_id: string; bin_id: string; expected: string; actual: string }[]
  >`
    SELECT coalesce(l.item_id, bs.item_id) AS item_id, coalesce(l.bin_id, bs.bin_id) AS bin_id,
           coalesce(l.total, 0)::text AS expected, coalesce(bs.qty, 0)::text AS actual
    FROM (SELECT item_id, bin_id, sum(qty) AS total FROM inventory.stock_ledger GROUP BY item_id, bin_id) l
    FULL JOIN inventory.bin_stock bs ON bs.item_id = l.item_id AND bs.bin_id = l.bin_id
    WHERE coalesce(l.total, 0) <> coalesce(bs.qty, 0)`;

  const buckets = await tx.$queryRaw<
    { item_id: string; expected: string; actual: string }[]
  >`
    SELECT sb.item_id,
           (coalesce(sum(bs.qty) FILTER (WHERE b.kind = 'RECEIVING'), 0)::text || '/' ||
            coalesce(sum(bs.qty) FILTER (WHERE b.kind = 'QUARANTINE'), 0)::text) AS expected,
           (sb.receiving::text || '/' || sb.quarantine::text) AS actual
    FROM inventory.stock_balance sb
    LEFT JOIN inventory.bin b ON b.store_id = sb.store_id
    LEFT JOIN inventory.bin_stock bs ON bs.bin_id = b.id AND bs.item_id = sb.item_id
    GROUP BY sb.store_id, sb.item_id, sb.receiving, sb.quarantine
    HAVING coalesce(sum(bs.qty) FILTER (WHERE b.kind = 'RECEIVING'), 0) <> sb.receiving
        OR coalesce(sum(bs.qty) FILTER (WHERE b.kind = 'QUARANTINE'), 0) <> sb.quarantine`;

  return [
    ...binsVsBalance.map((r) => ({
      check: 'bins_vs_balance' as const,
      itemId: r.item_id,
      binId: null,
      expected: r.expected,
      actual: r.actual,
    })),
    ...ledgerVsBin.map((r) => ({
      check: 'ledger_vs_bin' as const,
      itemId: r.item_id,
      binId: r.bin_id,
      expected: r.expected,
      actual: r.actual,
    })),
    ...buckets.map((r) => ({
      check: 'buckets' as const,
      itemId: r.item_id,
      binId: null,
      expected: r.expected,
      actual: r.actual,
    })),
  ];
}

@Injectable()
export class StockReconcileJob {
  private readonly logger = new Logger('StockReconcile');

  @Scheduled({
    name: 'inventory.reconcile',
    everySeconds: 24 * 3600,
    timeoutSeconds: 120,
  })
  async run(ctx: JobContext): Promise<void> {
    const mismatches = await findMismatches(ctx.tx);
    if (mismatches.length) {
      this.logger.error(
        { count: mismatches.length, first: mismatches.slice(0, 20) },
        'Stock figures do not agree with the ledger',
      );
      return;
    }
    this.logger.log('Stock figures agree with the ledger');
  }
}
