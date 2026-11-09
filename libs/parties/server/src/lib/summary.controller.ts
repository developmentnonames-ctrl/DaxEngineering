import { Controller, Get, Req } from '@nestjs/common';
import type { PartiesSummary } from '@dax/parties-contract';
import {
  Authenticated,
  can,
  type DaxRequest,
  sessionOf,
} from '@dax/platform-core';
import { PrismaService } from '@dax/platform-db';

@Controller('parties/summary')
export class PartiesSummaryController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Authenticated()
  async summary(@Req() req: DaxRequest): Promise<PartiesSummary> {
    const { policy } = sessionOf(req);
    const [customers, suppliers] = await Promise.all([
      can(policy, 'parties.customer.view')
        ? this.prisma.customer.count({ where: { active: true } })
        : null,
      can(policy, 'parties.supplier.view')
        ? this.prisma.supplier.count({ where: { active: true } })
        : null,
    ]);
    return { customers, suppliers };
  }
}
