import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Req,
} from '@nestjs/common';
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

export function encodeCursor(occurredAt: Date, id: string): string {
  return Buffer.from(`${occurredAt.toISOString()}|${id}`).toString('base64url');
}

export function decodeCursor(cursor: string): { occurredAt: Date; id: string } {
  const [iso, id] = Buffer.from(cursor, 'base64url')
    .toString('utf8')
    .split('|');
  const occurredAt = new Date(iso ?? '');
  if (!id || Number.isNaN(occurredAt.getTime())) {
    throw new BadRequestException({
      code: 'INVALID_INPUT',
      message: 'Bad cursor.',
      fields: ['cursor'],
    });
  }
  return { occurredAt, id };
}

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
    if (q.cursor) {
      const c = decodeCursor(q.cursor);
      where.OR = [
        { occurredAt: { lt: c.occurredAt } },
        { occurredAt: c.occurredAt, id: { lt: c.id } },
      ];
    }
    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
    });
    const page = rows.slice(0, q.limit);
    const last = page[page.length - 1];
    return {
      entries: page.map((r): AuditEntry => {
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
      nextCursor:
        rows.length > q.limit && last
          ? encodeCursor(last.occurredAt, last.id)
          : null,
    };
  }
}
