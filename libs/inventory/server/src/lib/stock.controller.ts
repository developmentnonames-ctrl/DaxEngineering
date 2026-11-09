import { Controller, Get, Query } from '@nestjs/common';
import { type StockPage, StockQuery } from '@dax/inventory-contract';
import { Requires } from '@dax/platform-core';
import { PrismaService } from '@dax/platform-db';
import { decodeCursor, encodeCursor, pageFrom, parse } from './common';
import {
  afterCursor,
  belowMinFilter,
  belowMinIds,
  itemSearch,
} from './item-queries';
import { MainStore } from './main-store.service';
import { isBelowMin, qtyString, stockFigures } from './stock-math';

@Controller('inventory/stock')
export class StockController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly store: MainStore,
  ) {}

  @Get()
  @Requires('inventory.stock.view')
  async list(@Query() raw: unknown): Promise<StockPage> {
    const query = parse(StockQuery, raw);
    const storeId = await this.store.id();
    const ids = query.belowMin ? await belowMinIds(this.prisma, storeId) : [];
    const inStock = { storeId, onHand: { gt: 0 } };
    const binFilter = {
      qty: { gt: 0 },
      ...(query.zoneId ? { bin: { zoneId: query.zoneId } } : {}),
    };
    const rows = await this.prisma.item.findMany({
      where: {
        AND: [
          { status: 'ACTIVE' },
          query.zoneId ? { binStock: { some: binFilter } } : {},
          query.inStock === 'true' ? { balances: { some: inStock } } : {},
          query.inStock === 'false' ? { balances: { none: inStock } } : {},
          itemSearch(query.q),
          belowMinFilter(query.belowMin, ids),
          afterCursor(query.cursor ? decodeCursor(query.cursor) : null),
        ],
      },
      select: {
        id: true,
        partNo: true,
        description: true,
        uom: true,
        minQty: true,
        brand: { select: { name: true } },
        balances: {
          where: { storeId },
          select: {
            onHand: true,
            held: true,
            quarantine: true,
            receiving: true,
          },
        },
        binStock: {
          where: binFilter,
          select: { qty: true, bin: { select: { code: true } } },
          orderBy: { bin: { code: 'asc' } },
        },
      },
      orderBy: [{ partNo: 'asc' }, { id: 'asc' }],
      take: query.limit + 1,
    });
    const page = pageFrom(rows, query.limit, (r) =>
      encodeCursor(r.partNo, r.id),
    );
    return {
      items: page.rows.map((r) => {
        const { figures, onHand } = stockFigures(r.balances[0]);
        return {
          item: {
            id: r.id,
            partNo: r.partNo,
            brand: r.brand.name,
            description: r.description,
            uom: r.uom,
          },
          stock: figures,
          minQty: qtyString(r.minQty),
          belowMin: isBelowMin(onHand, r.minQty),
          bins: r.binStock.map((b) => ({
            code: b.bin.code,
            qty: qtyString(b.qty),
          })),
        };
      }),
      nextCursor: page.nextCursor,
    };
  }
}
