import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ImportResult } from '@dax/contracts';
import { PartyQuery } from '@dax/parties-contract';
import {
  AuditService,
  assertWritable,
  buildSelect,
  NumberingService,
  type Policy,
  project,
  readableFields,
  snakeCase,
  writableFields,
} from '@dax/platform-core';
import {
  Prisma,
  PrismaService,
  type TransactionClient,
} from '@dax/platform-db';
import { type ImportError, parsePartyCsv, type Row } from './csv-import';
import {
  type Actor,
  decodeCursor,
  encodeCursor,
  isUniqueViolation,
  parse,
  stale,
} from './http';
import type { PartyKind } from './kinds';

export interface Page<D> {
  items: D[];
  nextCursor: string | null;
}

const MODULE_KEY = 'parties';
const CREATE_CHUNK = 500;
const MAX_CODE_PASSES = 20;
const IMPORT_TX = { maxWait: 10_000, timeout: 120_000 };

function pick(row: Row, keys: readonly string[]): Row {
  return Object.fromEntries(keys.map((k) => [k, row[k]]));
}

function codeTaken(): never {
  throw new ConflictException({
    code: 'CODE_TAKEN',
    message: 'That code was just used by someone else. Try again.',
  });
}

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

@Injectable()
export class PartiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly audit: AuditService,
  ) {}

  private select<D extends Row>(
    kind: PartyKind<D>,
    policy: Policy,
  ): Record<string, true> {
    const visible = buildSelect(kind.entity, policy);
    return Object.fromEntries(
      kind.dtoKeys.filter((k) => visible[k]).map((k) => [k, true as const]),
    );
  }

  private toDto<D extends Row>(
    kind: PartyKind<D>,
    policy: Policy,
    row: Row,
  ): D {
    return project<D>(kind.entity, policy, row).data as D;
  }

  private notFound<D extends Row>(kind: PartyKind<D>): never {
    throw new NotFoundException({
      code: 'NOT_FOUND',
      message: `${kind.label} not found.`,
    });
  }

  private createWrites<D extends Row>(kind: PartyKind<D>, input: Row): Row {
    return Object.fromEntries(
      Object.entries(input).filter(
        ([k, v]) =>
          v !== undefined && v !== null && kind.createDefaults[k] !== v,
      ),
    );
  }

  async list<D extends Row>(
    kind: PartyKind<D>,
    policy: Policy,
    rawQuery: unknown,
  ): Promise<Page<D>> {
    const query = parse(PartyQuery, rawQuery);
    const after = query.cursor ? decodeCursor(query.cursor) : null;
    const conditions: Prisma.Sql[] = [];
    if (query.active !== 'all') {
      conditions.push(Prisma.sql`active = ${query.active === 'true'}`);
    }
    if (query.q) {
      const like = `%${escapeLike(query.q.toLowerCase())}%`;
      conditions.push(
        Prisma.sql`(lower(name) LIKE ${like} OR code = ${query.q.toUpperCase()})`,
      );
    }
    if (after) {
      conditions.push(
        Prisma.sql`(name, id) > (${after.name}, ${after.id}::uuid)`,
      );
    }
    const where = conditions.length
      ? Prisma.join(conditions, ' AND ')
      : Prisma.sql`TRUE`;
    const page = await this.prisma.$queryRaw<{ id: string; name: string }[]>`
      SELECT id, name FROM ${Prisma.raw(kind.sqlTable)}
      WHERE ${where}
      ORDER BY name, id
      LIMIT ${query.limit + 1}`;
    const ids = page.slice(0, query.limit).map((r) => r.id);
    const last = page[query.limit - 1];
    const nextCursor =
      page.length > query.limit && last ? encodeCursor(last) : null;
    if (ids.length === 0) return { items: [], nextCursor: null };

    const rows = await kind.table(this.prisma).findMany({
      where: { id: { in: ids } },
      select: this.select(kind, policy),
    });
    const byId = new Map(rows.map((r) => [String(r['id']), r]));
    const items = ids
      .map((id) => byId.get(id))
      .filter((r): r is Row => r !== undefined)
      .map((r) => this.toDto(kind, policy, r));
    return { items, nextCursor };
  }

  async get<D extends Row>(
    kind: PartyKind<D>,
    policy: Policy,
    id: string,
  ): Promise<D> {
    const row = await kind.table(this.prisma).findUnique({
      where: { id },
      select: this.select(kind, policy),
    });
    if (!row) this.notFound(kind);
    return this.toDto(kind, policy, row);
  }

  async create<D extends Row>(
    kind: PartyKind<D>,
    actor: Actor,
    body: unknown,
  ): Promise<D> {
    const input = parse(kind.input, body);
    assertWritable(kind.entity, actor.policy, this.createWrites(kind, input));
    let id: string;
    try {
      id = await this.prisma.$transaction(async (tx) => {
        const [code] = await this.assignCodes(tx, kind, 1, new Set());
        const row = await kind.table(tx).create({
          data: {
            ...input,
            code,
            createdBy: actor.userId,
            updatedBy: actor.userId,
          },
          select: { id: true },
        });
        const createdId = String(row['id']);
        await this.audit.record(
          {
            moduleKey: MODULE_KEY,
            entityKey: kind.entity.key,
            entityId: createdId,
            action: 'create',
            after: { code, ...input },
          },
          tx,
        );
        return createdId;
      });
    } catch (error) {
      if (isUniqueViolation(error)) codeTaken();
      throw error;
    }
    return this.get(kind, actor.policy, id);
  }

  async update<D extends Row>(
    kind: PartyKind<D>,
    actor: Actor,
    id: string,
    body: unknown,
  ): Promise<D> {
    const { version, ...input } = parse(kind.update, body);
    const readable = readableFields(actor.policy, kind.entity.key);
    return this.change(kind, actor, id, version, 'update', (current) => {
      const changes = Object.fromEntries(
        Object.entries(input).filter(
          ([k, v]) => v !== undefined && (!readable.has(k) || current[k] !== v),
        ),
      );
      assertWritable(kind.entity, actor.policy, changes);
      return changes;
    });
  }

  async setActive<D extends Row>(
    kind: PartyKind<D>,
    actor: Actor,
    id: string,
    version: number,
    active: boolean,
  ): Promise<D> {
    return this.change(
      kind,
      actor,
      id,
      version,
      active ? 'restore' : 'archive',
      (current) => (current['active'] === active ? {} : { active }),
    );
  }

  private async change<D extends Row>(
    kind: PartyKind<D>,
    actor: Actor,
    id: string,
    version: number,
    action: string,
    changesOf: (current: Row) => Row,
  ): Promise<D> {
    await this.prisma.$transaction(async (tx) => {
      const table = kind.table(tx);
      const current = await table.findUnique({ where: { id } });
      if (!current) this.notFound(kind);
      if (current['version'] !== version) stale();
      const changes = changesOf(current);
      const keys = Object.keys(changes);
      if (keys.length === 0) return;
      const { count } = await table.updateMany({
        where: { id, version },
        data: {
          ...changes,
          version: { increment: 1 },
          updatedBy: actor.userId,
        },
      });
      if (count === 0) stale();
      await this.audit.record(
        {
          moduleKey: MODULE_KEY,
          entityKey: kind.entity.key,
          entityId: id,
          action,
          before: pick(current, keys),
          after: changes,
        },
        tx,
      );
    });
    return this.get(kind, actor.policy, id);
  }

  async importCsv<D extends Row>(
    kind: PartyKind<D>,
    actor: Actor,
    text: string,
    dryRun: boolean,
  ): Promise<ImportResult> {
    const parsed = parsePartyCsv(text, {
      columns: kind.csvColumns,
      booleans: kind.csvBooleans,
      schema: kind.input,
      label: (field) => kind.entity.fields[field]?.label ?? field,
    });
    const errors: ImportError[] = [
      ...parsed.errors,
      ...this.unwritableColumns(kind, actor.policy, parsed.rows),
      ...(await this.codesInUse(kind, this.prisma, parsed.rows)),
    ].sort((a, b) => a.row - b.row);
    const result: ImportResult = {
      dryRun,
      total: parsed.total,
      created: 0,
      errors,
    };
    if (errors.length) return result;
    if (dryRun) return { ...result, created: parsed.rows.length };

    try {
      await this.prisma.$transaction(async (tx) => {
        const auto = parsed.rows.filter((r) => r.code === null);
        const reserved = new Set(
          parsed.rows.flatMap((r) => (r.code === null ? [] : [r.code])),
        );
        const codes = await this.assignCodes(tx, kind, auto.length, reserved);
        const assigned = new Map(auto.map((r, i) => [r, codes[i]]));
        const data = parsed.rows.map((r) => ({
          ...r.input,
          code: r.code ?? assigned.get(r),
          createdBy: actor.userId,
          updatedBy: actor.userId,
        }));
        for (let i = 0; i < data.length; i += CREATE_CHUNK) {
          await kind
            .table(tx)
            .createMany({ data: data.slice(i, i + CREATE_CHUNK) });
        }
        await this.audit.record(
          {
            moduleKey: MODULE_KEY,
            entityKey: kind.entity.key,
            action: 'import',
            after: {
              rows: parsed.total,
              created: data.length,
              withOwnCode: data.length - auto.length,
            },
          },
          tx,
        );
      }, IMPORT_TX);
    } catch (error) {
      if (isUniqueViolation(error)) codeTaken();
      throw error;
    }
    return { ...result, created: parsed.rows.length };
  }

  private unwritableColumns<D extends Row>(
    kind: PartyKind<D>,
    policy: Policy,
    rows: readonly { input: Row }[],
  ): ImportError[] {
    const writable = writableFields(policy, kind.entity.key);
    const used = new Set(
      rows.flatMap((r) => Object.keys(this.createWrites(kind, r.input))),
    );
    return [...used]
      .filter((f) => !writable.has(f))
      .map((f) => ({
        row: 0,
        field: snakeCase(f),
        message: `You don't have access to set ${kind.entity.fields[f]?.label ?? f}. Remove this column.`,
      }));
  }

  private async codesInUse<D extends Row>(
    kind: PartyKind<D>,
    db: PrismaService | TransactionClient,
    rows: readonly { row: number; code: string | null }[],
  ): Promise<ImportError[]> {
    const withCode = rows.filter(
      (r): r is { row: number; code: string } => r.code !== null,
    );
    if (withCode.length === 0) return [];
    const taken = await kind.table(db).findMany({
      where: { code: { in: withCode.map((r) => r.code) } },
      select: { code: true },
    });
    const inUse = new Set(taken.map((t) => String(t['code'])));
    return withCode
      .filter((r) => inUse.has(r.code))
      .map((r) => ({
        row: r.row,
        field: 'code',
        message: `Code ${r.code} is already in use.`,
      }));
  }

  private async assignCodes<D extends Row>(
    tx: TransactionClient,
    kind: PartyKind<D>,
    count: number,
    reserved: Set<string>,
  ): Promise<string[]> {
    const out: string[] = [];
    for (let pass = 0; out.length < count; pass++) {
      if (pass >= MAX_CODE_PASSES) {
        throw new ConflictException({
          code: 'CODE_UNAVAILABLE',
          message: `A free ${kind.label.toLowerCase()} code could not be found. Check the number series.`,
        });
      }
      const batch: string[] = [];
      while (batch.length < count - out.length) {
        const { number } = await this.numbering.next(tx, {
          docType: kind.docType,
          date: new Date(),
        });
        if (reserved.has(number)) continue;
        reserved.add(number);
        batch.push(number);
      }
      const taken = await kind.table(tx).findMany({
        where: { code: { in: batch } },
        select: { code: true },
      });
      const inUse = new Set(taken.map((t) => String(t['code'])));
      out.push(...batch.filter((c) => !inUse.has(c)));
    }
    return out;
  }
}
