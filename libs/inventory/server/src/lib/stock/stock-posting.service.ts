import {
  ConflictException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { RequestContext } from '@dax/platform-core';
import { Prisma, type TransactionClient } from '@dax/platform-db';
import { MainStore } from '../main-store.service';
import { dec, qtyString } from '../stock-math';

export type MovementKind =
  'RECEIVE' | 'RECEIVE_DAMAGED' | 'PUTAWAY_OUT' | 'PUTAWAY_IN' | 'REVERSAL';

export interface Movement {
  itemId: string;
  binId: string;
  qty: Prisma.Decimal | string;
  movement: MovementKind;
  docType: string;
  docId: string;
  docLineId?: string | null;
  docNumber?: string | null;
  reversalOf?: string | null;
}

export interface PostedMovement {
  ledgerId: string;
  itemId: string;
  binId: string;
  qty: string;
  binQtyAfter: string;
}

interface BinInfo {
  id: string;
  storeId: string;
  code: string;
  kind: 'STORAGE' | 'RECEIVING' | 'QUARANTINE' | 'WARRANTY';
  active: boolean;
}

export function insufficient(itemId: string, binCode: string): never {
  throw new ConflictException({
    code: 'INSUFFICIENT_STOCK',
    message: `Not enough stock in bin ${binCode} for this item.`,
    itemId,
    bin: binCode,
  });
}

function isCheckViolation(error: unknown): boolean {
  const e = error as {
    code?: string;
    meta?: { code?: string };
    message?: string;
  };
  return (
    e.meta?.code === '23514' ||
    e.code === '23514' ||
    (typeof e.message === 'string' &&
      e.message.includes('violates check constraint'))
  );
}

export function orderMovements<T extends { itemId: string; binId: string }>(
  movements: readonly T[],
): T[] {
  return [...movements].sort((a, b) =>
    a.itemId === b.itemId
      ? a.binId.localeCompare(b.binId)
      : a.itemId.localeCompare(b.itemId),
  );
}

@Injectable()
export class StockPostingService {
  constructor(
    private readonly store: MainStore,
    private readonly context: RequestContext,
  ) {}

  async post(
    tx: TransactionClient,
    movements: readonly Movement[],
    actorId: string,
  ): Promise<PostedMovement[]> {
    if (movements.length === 0) return [];
    const storeId = await this.store.id();
    const bins = new Map<string, BinInfo>(
      (
        await tx.bin.findMany({
          where: { id: { in: [...new Set(movements.map((m) => m.binId))] } },
          select: {
            id: true,
            storeId: true,
            code: true,
            kind: true,
            active: true,
          },
        })
      ).map((b) => [b.id, b]),
    );
    const requestId = this.context.get().requestId ?? null;
    const posted: PostedMovement[] = [];

    for (const m of orderMovements(movements)) {
      const bin = bins.get(m.binId);
      if (!bin || bin.storeId !== storeId) {
        throw new UnprocessableEntityException({
          code: 'UNKNOWN_BIN',
          message: 'That bin does not exist in this store.',
        });
      }
      const qty = dec(m.qty);
      if (qty.isZero()) continue;
      if (bin.kind === 'WARRANTY') {
        throw new UnprocessableEntityException({
          code: 'WARRANTY_BIN',
          message: 'The warranty bin holds tagged parts, not stock.',
        });
      }
      if (qty.gt(0) && !bin.active) {
        throw new UnprocessableEntityException({
          code: 'BIN_INACTIVE',
          message: `Bin ${bin.code} is not active.`,
        });
      }
      const amount = qtyString(qty);
      const receiving = bin.kind === 'RECEIVING' ? amount : '0';
      const quarantine = bin.kind === 'QUARANTINE' ? amount : '0';

      let binQtyAfter: string;
      try {
        // Postgres checks CHECK constraints on the proposed INSERT row even when ON CONFLICT updates, so withdrawals must be plain UPDATEs.
        const [row] = qty.gt(0)
          ? await tx.$queryRaw<{ qty: Prisma.Decimal }[]>`
              INSERT INTO inventory.bin_stock (bin_id, item_id, qty, updated_at)
              VALUES (${m.binId}::uuid, ${m.itemId}::uuid, ${amount}::numeric, now())
              ON CONFLICT (bin_id, item_id)
              DO UPDATE SET qty = inventory.bin_stock.qty + EXCLUDED.qty, updated_at = now()
              RETURNING qty`
          : await tx.$queryRaw<{ qty: Prisma.Decimal }[]>`
              UPDATE inventory.bin_stock SET qty = qty + ${amount}::numeric, updated_at = now()
              WHERE bin_id = ${m.binId}::uuid AND item_id = ${m.itemId}::uuid
              RETURNING qty`;
        if (!row) insufficient(m.itemId, bin.code);
        binQtyAfter = qtyString(row.qty);
        const updated = qty.gt(0)
          ? await tx.$executeRaw`
              INSERT INTO inventory.stock_balance
                (store_id, item_id, on_hand, held, quarantine, receiving, updated_at)
              VALUES (${storeId}::uuid, ${m.itemId}::uuid, ${amount}::numeric, 0,
                      ${quarantine}::numeric, ${receiving}::numeric, now())
              ON CONFLICT (store_id, item_id) DO UPDATE SET
                on_hand = inventory.stock_balance.on_hand + EXCLUDED.on_hand,
                quarantine = inventory.stock_balance.quarantine + EXCLUDED.quarantine,
                receiving = inventory.stock_balance.receiving + EXCLUDED.receiving,
                updated_at = now()`
          : await tx.$executeRaw`
              UPDATE inventory.stock_balance SET
                on_hand = on_hand + ${amount}::numeric,
                quarantine = quarantine + ${quarantine}::numeric,
                receiving = receiving + ${receiving}::numeric,
                updated_at = now()
              WHERE store_id = ${storeId}::uuid AND item_id = ${m.itemId}::uuid`;
        if (updated === 0) insufficient(m.itemId, bin.code);
      } catch (error) {
        if (isCheckViolation(error)) insufficient(m.itemId, bin.code);
        throw error;
      }

      const ledger = await tx.stockLedger.create({
        data: {
          storeId,
          itemId: m.itemId,
          binId: m.binId,
          qty: amount,
          binQtyAfter,
          movement: m.movement,
          docType: m.docType,
          docId: m.docId,
          docLineId: m.docLineId ?? null,
          docNumber: m.docNumber ?? null,
          reversalOf: m.reversalOf ?? null,
          actorId,
          requestId,
        },
        select: { id: true },
      });
      posted.push({
        ledgerId: ledger.id,
        itemId: m.itemId,
        binId: m.binId,
        qty: amount,
        binQtyAfter,
      });
    }
    return posted;
  }
}
