import { Controller, Get, Query, Req } from '@nestjs/common';
import { pageMeta, pageWindow } from '@dax/contracts';
import {
  type AuditEntry,
  type AuditPage,
  AuditQuery,
} from '@dax/platform-contract';
import { Prisma, PrismaService } from '@dax/platform-db';
import { type Policy, readableFields } from '../acm/policy';
import { AuditService } from '../audit/audit.service';
import type { DaxRequest } from '../auth/internal-caller';
import { AppOnly, Requires, sessionOf } from '../auth/session.guard';
import { parse } from './common';

export function visibleValues(
  values: unknown,
  allowed: ReadonlySet<string> | null,
): Record<string, unknown> | null {
  if (!values || typeof values !== 'object' || Array.isArray(values))
    return null;
  const entries = Object.entries(values as Record<string, unknown>);
  return Object.fromEntries(
    allowed ? entries.filter(([k]) => allowed.has(k)) : entries,
  );
}

@Controller('admin/audit')
@AppOnly('admin')
export class AdminAuditController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private allowed(
    policy: Policy,
    entityKey: string,
  ): ReadonlySet<string> | null {
    if (policy.isSuperAdmin || !this.audit.entity(entityKey)) return null;
    return readableFields(policy, entityKey);
  }

  @Get()
  @Requires('core.audit.view')
  async list(
    @Req() req: DaxRequest,
    @Query() query: unknown,
  ): Promise<AuditPage> {
    const { policy } = sessionOf(req);
    const q = parse(AuditQuery, query);
    const where: Prisma.AuditLogWhereInput = {
      ...(q.entityKey ? { entityKey: q.entityKey } : {}),
      ...(q.entityId ? { entityId: q.entityId } : {}),
      ...(q.actorId ? { actorId: q.actorId } : {}),
      ...(q.action ? { action: q.action } : {}),
      ...(q.from || q.to
        ? {
            occurredAt: {
              ...(q.from ? { gte: new Date(q.from) } : {}),
              ...(q.to ? { lte: new Date(q.to) } : {}),
            },
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        ...pageWindow(q),
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return {
      ...pageMeta(q, total),
      entries: rows.map((r): AuditEntry => {
        const allowed = this.allowed(policy, r.entityKey);
        return {
          id: r.id,
          occurredAt: r.occurredAt.toISOString(),
          actorId: r.actorId,
          actorName: r.actorName,
          app: r.app,
          moduleKey: r.moduleKey,
          entityKey: r.entityKey,
          entityId: r.entityId,
          action: r.action,
          before: visibleValues(r.before, allowed),
          after: visibleValues(r.after, allowed),
          changedFields: allowed
            ? r.changedFields.filter((f) => allowed.has(f))
            : r.changedFields,
          reason: r.reason,
          restricted: r.restricted,
        };
      }),
    };
  }
}
