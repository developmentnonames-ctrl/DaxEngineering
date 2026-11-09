import { Inject, Injectable } from '@nestjs/common';
import {
  Prisma,
  PrismaService,
  type TransactionClient,
} from '@dax/platform-db';
import type { EntityDef } from '../acm/entity';
import {
  RequestContext,
  type RequestContextData,
} from '../context/request-context';

export const ENTITY_DEFS = Symbol.for('dax.platform-core.entity-defs');
export const REDACTED = '[restricted]';

export interface AuditEntryInput {
  moduleKey: string;
  entityKey: string;
  entityId?: string | null;
  action: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  reason?: string | null;
  restricted?: boolean;
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function toJson(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return value.toString();
  if (
    value !== null &&
    typeof value === 'object' &&
    (value as { constructor?: { name?: string } }).constructor?.name ===
      'Decimal'
  ) {
    return String(value);
  }
  return value;
}

export function sanitizeForAudit(
  def: EntityDef | undefined,
  values: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!values) return null;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    const meta = def?.fields[key];
    out[key] =
      meta?.tier === 'RESTRICTED' && !meta.encrypted && value != null
        ? REDACTED
        : toJson(value);
  }
  return out;
}

export function changedFields(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): string[] {
  const keys = new Set([
    ...Object.keys(before ?? {}),
    ...Object.keys(after ?? {}),
  ]);
  return [...keys].filter((k) => !same(before?.[k], after?.[k])).sort();
}

@Injectable()
export class AuditService {
  private readonly defs: Map<string, EntityDef>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly context: RequestContext,
    @Inject(ENTITY_DEFS) defs: EntityDef[],
  ) {
    this.defs = new Map(defs.map((d) => [d.key, d]));
  }

  entity(key: string): EntityDef | undefined {
    return this.defs.get(key);
  }

  async record(
    entry: AuditEntryInput,
    tx?: TransactionClient,
    ctx: RequestContextData = this.context.get(),
  ): Promise<void> {
    const def = this.defs.get(entry.entityKey);
    const before = sanitizeForAudit(def, entry.before);
    const after = sanitizeForAudit(def, entry.after);
    await (tx ?? this.prisma).auditLog.create({
      data: {
        actorId: ctx.actor?.id ?? null,
        actorName: ctx.actor?.name ?? null,
        app: ctx.app ?? null,
        requestId: ctx.requestId ?? null,
        ip: ctx.ip ?? null,
        moduleKey: entry.moduleKey,
        entityKey: entry.entityKey,
        entityId: entry.entityId ?? null,
        action: entry.action,
        before: (before ?? Prisma.DbNull) as Prisma.InputJsonValue,
        after: (after ?? Prisma.DbNull) as Prisma.InputJsonValue,
        changedFields:
          entry.action === 'update' ? changedFields(before, after) : [],
        reason: entry.reason ?? null,
        restricted: entry.restricted ?? false,
      },
    });
  }

  async restrictedRead(
    entityKey: string,
    entityId: string | null,
    fields: string[],
    action = 'read',
  ): Promise<void> {
    if (fields.length === 0) return;
    const def = this.defs.get(entityKey);
    await this.record({
      moduleKey: def?.moduleKey ?? entityKey.split('.')[0],
      entityKey,
      entityId,
      action,
      after: { fields: [...fields].sort() },
      restricted: true,
    });
  }
}
