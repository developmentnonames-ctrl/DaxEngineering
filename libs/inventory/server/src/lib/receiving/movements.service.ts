import { Injectable } from '@nestjs/common';
import type { MovementPage, MovementQuery } from '@dax/inventory-contract';
import { pageMeta, pageWindow } from '@dax/contracts';
import { type Prisma, PrismaService } from '@dax/platform-db';
import { notFound } from '../common';
import { qtyString } from '../stock-math';
import { userNames } from './shared';

@Injectable()
export class MovementsService {
  constructor(private readonly prisma: PrismaService) {}

  async forItem(itemId: string, query: MovementQuery): Promise<MovementPage> {
    const item = await this.prisma.item.findUnique({
      where: { id: itemId },
      select: { id: true },
    });
    if (!item) notFound('Item not found.');
    const where: Prisma.StockLedgerWhereInput = { itemId };
    const findRows = this.prisma.stockLedger.findMany({
      where,
      select: {
        id: true,
        occurredAt: true,
        qty: true,
        binQtyAfter: true,
        movement: true,
        docType: true,
        docId: true,
        docNumber: true,
        actorId: true,
        bin: { select: { id: true, code: true } },
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      ...pageWindow(query),
    });
    const [rows, total] = await Promise.all([
      findRows,
      this.prisma.stockLedger.count({ where }),
    ]);
    const names = await userNames(
      this.prisma,
      rows.map((r) => r.actorId),
    );
    return {
      items: rows.map((r) => ({
        id: r.id,
        occurredAt: r.occurredAt.toISOString(),
        bin: r.bin,
        qty: qtyString(r.qty),
        binQtyAfter: qtyString(r.binQtyAfter),
        movement: r.movement,
        docType: r.docType,
        docId: r.docId,
        docNumber: r.docNumber,
        actor: names.get(r.actorId) ?? null,
      })),
      ...pageMeta(query, total),
    };
  }
}
