import { Injectable } from '@nestjs/common';
import type { MovementPage, MovementQuery } from '@dax/inventory-contract';
import { PrismaService } from '@dax/platform-db';
import { encodeCursor, notFound, pageFrom } from '../common';
import { qtyString } from '../stock-math';
import { timeCursor, userNames } from './shared';

@Injectable()
export class MovementsService {
  constructor(private readonly prisma: PrismaService) {}

  async forItem(itemId: string, query: MovementQuery): Promise<MovementPage> {
    const item = await this.prisma.item.findUnique({
      where: { id: itemId },
      select: { id: true },
    });
    if (!item) notFound('Item not found.');
    const point = timeCursor(query.cursor);
    const rows = await this.prisma.stockLedger.findMany({
      where: {
        itemId,
        ...(point
          ? {
              OR: [
                { occurredAt: { lt: point.at } },
                { occurredAt: point.at, id: { lt: point.id } },
              ],
            }
          : {}),
      },
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
      take: query.limit + 1,
    });
    const page = pageFrom(rows, query.limit, (r) =>
      encodeCursor(r.occurredAt.toISOString(), r.id),
    );
    const names = await userNames(
      this.prisma,
      page.rows.map((r) => r.actorId),
    );
    return {
      items: page.rows.map((r) => ({
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
      nextCursor: page.nextCursor,
    };
  }
}
