import { Controller, Get } from '@nestjs/common';
import type { InventorySummary } from '@dax/inventory-contract';
import { Requires } from '@dax/platform-core';
import { PrismaService } from '@dax/platform-db';
import { belowMinIds } from './item-queries';
import { MainStore } from './main-store.service';

@Controller('inventory/summary')
export class SummaryController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly store: MainStore,
  ) {}

  @Get()
  @Requires('inventory.item.view')
  async summary(): Promise<InventorySummary> {
    const storeId = await this.store.id();
    const [items, low, inStock, bins, zones, brands] = await Promise.all([
      this.prisma.item.count({ where: { status: 'ACTIVE' } }),
      belowMinIds(this.prisma, storeId),
      this.prisma.stockBalance.count({ where: { storeId, onHand: { gt: 0 } } }),
      this.prisma.bin.count({ where: { storeId, active: true } }),
      this.prisma.zone.count({ where: { storeId, active: true } }),
      this.prisma.brand.count({ where: { active: true } }),
    ]);
    return { items, belowMin: low.length, inStock, bins, zones, brands };
  }
}
