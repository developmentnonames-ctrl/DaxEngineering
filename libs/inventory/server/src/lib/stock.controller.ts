import { Controller, Get, Query } from '@nestjs/common';
import { type StockPage, StockQuery } from '@dax/inventory-contract';
import { pageMeta, pageWindow } from '@dax/contracts';
import { Requires } from '@dax/platform-core';
import { type Prisma, PrismaService } from '@dax/platform-db';
import { parse } from './common';
import { belowMinFilter, belowMinIds, itemSearch } from './item-queries';
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
    const where: Prisma.ItemWhereInput = {
      AND: [
        { status: 'ACTIVE' },
        query.zoneId ? { binStock: { some: binFilter } } : {},
        query.inStock === 'true' ? { balances: { some: inStock } } : {},
        query.inStock === 'false' ? { balances: { none: inStock } } : {},
        itemSearch(query.q),
        belowMinFilter(query.belowMin, ids),
      ],
    };
    const findRows = this.prisma.item.findMany({
      where,
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
      ...pageWindow(query),
    });
    const [rows, total] = await Promise.all([
      findRows,
      this.prisma.item.count({ where }),
    ]);
    return {
      items: rows.map((r) => {
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
      ...pageMeta(query, total),
    };
  }
}
