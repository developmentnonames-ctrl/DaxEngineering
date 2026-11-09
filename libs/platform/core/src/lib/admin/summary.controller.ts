import { Controller, Get } from '@nestjs/common';
import type { AdminSummary } from '@dax/platform-contract';
import { PrismaService } from '@dax/platform-db';
import { AppOnly, Requires } from '../auth/session.guard';

@Controller('admin/summary')
@AppOnly('admin')
export class AdminSummaryController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Requires('core.admin.access')
  async summary(): Promise<AdminSummary> {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 3600 * 1000);
    const [users, active, locked, invited, roles, auditToday] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.user.count({ where: { active: true } }),
        this.prisma.user.count({ where: { lockedUntil: { gt: now } } }),
        this.prisma.user.count({
          where: {
            active: true,
            accounts: {
              none: { providerId: 'credential', password: { not: null } },
            },
          },
        }),
        this.prisma.role.count({ where: { archivedAt: null } }),
        this.prisma.auditLog.count({ where: { occurredAt: { gte: dayAgo } } }),
      ]);
    return { users, active, locked, invited, roles, auditToday };
  }
}
