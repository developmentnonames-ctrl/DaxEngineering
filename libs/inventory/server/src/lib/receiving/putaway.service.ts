import { Injectable } from '@nestjs/common';
import type { PutawayInput, PutawayList } from '@dax/inventory-contract';
import { AuditService, EventBus, type Policy } from '@dax/platform-core';
import { type Prisma, PrismaService } from '@dax/platform-db';
import { conflict, invalid } from '../common';
import { MainStore } from '../main-store.service';
import { dec, qtyString } from '../stock-math';
import { stockPutAway } from '../stock/events';
import {
  type Movement,
  StockPostingService,
} from '../stock/stock-posting.service';
import { isFullyPutAway, putawayOverLimit, toPutAway } from './rules';
import {
  auditEntry,
  checkQty,
  GRN_DOC_TYPE,
  GRN_KEY,
  ITEM_REF_SELECT,
  specialBins,
  toItemRef,
} from './shared';

@Injectable()
export class PutawayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: EventBus,
    private readonly stock: StockPostingService,
    private readonly store: MainStore,
  ) {}

  async list(): Promise<PutawayList> {
    const grns = await this.prisma.grn.findMany({
      where: { status: 'POSTED' },
      select: {
        id: true,
        number: true,
        postedAt: true,
        lines: {
          select: {
            id: true,
            qtyGood: true,
            qtyPutAway: true,
            item: {
              select: {
                ...ITEM_REF_SELECT,
                defaultBin: { select: { id: true, code: true } },
              },
            },
          },
          orderBy: { lineNo: 'asc' },
        },
      },
      orderBy: [{ postedAt: 'asc' }, { id: 'asc' }],
    });
    return {
      rows: grns.flatMap(({ id, number, postedAt, lines }) => {
        if (!number || !postedAt) return [];
        return lines
          .map((line) => ({
            line,
            left: toPutAway(line.qtyGood, line.qtyPutAway),
          }))
          .filter(({ left }) => left.gt(0))
          .map(({ line, left }) => ({
            grn: { id, number },
            grnLineId: line.id,
            item: toItemRef(line.item),
            toPutAway: qtyString(left),
            defaultBin: line.item.defaultBin,
            postedAt: postedAt.toISOString(),
          }));
      }),
    };
  }

  async putAway(policy: Policy, input: PutawayInput): Promise<PutawayList> {
    const storeId = await this.store.id();
    const bins = await specialBins(this.prisma, storeId);
    const lineIds = [...new Set(input.moves.map((m) => m.grnLineId))];
    const known = await this.prisma.grnLine.findMany({
      where: { id: { in: lineIds } },
      select: { id: true, grnId: true },
    });
    if (known.length !== lineIds.length) {
      invalid('Some of these lines are not on a GRN.', ['moves']);
    }
    const grnIds = [...new Set(known.map((l) => l.grnId))].sort();
    const targets = await this.prisma.bin.findMany({
      where: { id: { in: [...new Set(input.moves.map((m) => m.binId))] } },
      select: { id: true, storeId: true, kind: true, active: true },
    });
    const targetOk = new Set(
      targets
        .filter(
          (b) => b.storeId === storeId && b.kind === 'STORAGE' && b.active,
        )
        .map((b) => b.id),
    );
    input.moves.forEach((m, i) => {
      if (!targetOk.has(m.binId)) {
        invalid('Put stock away into an active storage bin.', [
          `moves.${i}.binId`,
        ]);
      }
    });

    await this.prisma.$transaction(async (tx) => {
      for (const grnId of grnIds) {
        const claimed = await tx.grn.updateMany({
          where: { id: grnId, status: 'POSTED' },
          data: { version: { increment: 1 }, updatedBy: policy.userId },
        });
        if (claimed.count === 0) {
          conflict(
            'INVALID_STATE',
            'This GRN is no longer waiting for put-away. Reload and try again.',
          );
        }
      }
      const grns = await tx.grn.findMany({
        where: { id: { in: grnIds } },
        select: {
          id: true,
          number: true,
          lines: {
            select: {
              id: true,
              itemId: true,
              qtyGood: true,
              qtyPutAway: true,
              item: {
                select: { partNo: true, allowFraction: true, status: true },
              },
            },
          },
        },
      });
      const lines = new Map(
        grns.flatMap((g) =>
          g.lines.map((l) => [l.id, { ...l, grn: g }] as const),
        ),
      );
      const moves = input.moves.map((move, i) => {
        const line = lines.get(move.grnLineId);
        if (!line) invalid('Some of these lines are not on a GRN.', ['moves']);
        checkQty({ id: line.itemId, ...line.item }, move.qty, `moves.${i}.qty`);
        return { ...move, line, qty: dec(move.qty) };
      });
      const remaining = new Map(
        [...lines].map(([id, l]) => [id, toPutAway(l.qtyGood, l.qtyPutAway)]),
      );
      const over = putawayOverLimit(moves, remaining);
      if (over) {
        conflict(
          'PUTAWAY_TOO_MUCH',
          `Only ${qtyString(remaining.get(over) ?? 0)} of ${lines.get(over)?.item.partNo ?? 'this item'} is left to put away.`,
        );
      }

      const movements: Movement[] = moves.flatMap(({ line, binId, qty }) => {
        const base = {
          itemId: line.itemId,
          docType: GRN_DOC_TYPE,
          docId: line.grn.id,
          docLineId: line.id,
          docNumber: line.grn.number,
        };
        return [
          {
            ...base,
            binId: bins.receiving,
            qty: qty.neg(),
            movement: 'PUTAWAY_OUT' as const,
          },
          { ...base, binId, qty, movement: 'PUTAWAY_IN' as const },
        ];
      });
      await this.stock.post(tx, movements, policy.userId);

      const added = new Map<string, Prisma.Decimal>();
      for (const m of moves) {
        added.set(m.grnLineId, (added.get(m.grnLineId) ?? dec(0)).plus(m.qty));
      }
      for (const [lineId, qty] of added) {
        await tx.grnLine.update({
          where: { id: lineId },
          data: { qtyPutAway: { increment: qtyString(qty) } },
        });
      }

      for (const grn of grns) {
        const own = moves.filter((m) => m.line.grn.id === grn.id);
        const done = isFullyPutAway(
          grn.lines.map((l) => ({
            qtyGood: l.qtyGood,
            qtyPutAway: dec(l.qtyPutAway).plus(added.get(l.id) ?? 0),
          })),
        );
        if (done) {
          await tx.grn.update({
            where: { id: grn.id },
            data: { status: 'PUT_AWAY' },
          });
        }
        await this.events.publish(tx, stockPutAway, {
          grnId: grn.id,
          moves: own.map((m) => ({
            itemId: m.line.itemId,
            binId: m.binId,
            qty: qtyString(m.qty),
          })),
        });
        await this.audit.record(
          auditEntry(
            GRN_KEY,
            grn.id,
            'put_away',
            {
              moves: own.map((m) => ({
                grnLineId: m.grnLineId,
                binId: m.binId,
                qty: qtyString(m.qty),
              })),
              ...(done ? { status: 'PUT_AWAY' } : {}),
            },
            done ? { before: { status: 'POSTED' } } : {},
          ),
          tx,
        );
      }
    });
    return this.list();
  }
}
