import { pageMeta, pageWindow } from '@dax/contracts';
import { ConflictException, Injectable } from '@nestjs/common';
import type {
  CountAddLine,
  CountCreate,
  CountDto,
  CountEntry,
  CountPage,
  CountQuery,
  CountReason,
  CountScope,
} from '@dax/inventory-contract';
import {
  AuditService,
  can,
  NumberingService,
  type Policy,
} from '@dax/platform-core';
import {
  type Prisma,
  PrismaService,
  type TransactionClient,
} from '@dax/platform-db';
import {
  conflict,
  invalid,
  isUniqueViolation,
  notFound,
  stale,
} from '../common';
import { MainStore } from '../main-store.service';
import {
  auditEntry,
  checkQty,
  ITEM_REF_SELECT,
  loadItems,
  stampOf,
  toItemRef,
  userNames,
} from '../receiving/shared';
import { qtyString } from '../stock-math';
import {
  COUNT_DOC_TYPE,
  type Movement,
  StockPostingService,
} from '../stock/stock-posting.service';
import {
  assertCountAction,
  assertNotSelfApproval,
  COUNT_ALLOWED_FROM,
  COUNTABLE_BIN_KINDS,
  type CountAction,
  type CountKind,
  type CountStatus,
  difference,
  ineligibility,
  ineligibleMessage,
  OPEN_COUNT_STATUSES,
  seesSystemQty,
  tookPart,
  uncounted,
} from './rules';

export const COUNT_KEY = 'inventory.stock_count';

const LONG_TX = { timeout: 120_000, maxWait: 10_000 };

const SUMMARY_SELECT = {
  id: true,
  number: true,
  kind: true,
  status: true,
  blind: true,
  createdAt: true,
  createdBy: true,
  _count: { select: { lines: true } },
} as const;

const DETAIL_SELECT = {
  ...SUMMARY_SELECT,
  notes: true,
  version: true,
  submittedBy: true,
  submittedAt: true,
  rejectReason: true,
  rejectedBy: true,
  rejectedAt: true,
  approvedBy: true,
  approvedAt: true,
  cancelledBy: true,
  cancelledAt: true,
  cancelReason: true,
  lines: {
    select: {
      id: true,
      systemQty: true,
      countedQty: true,
      countedBy: true,
      countedAt: true,
      added: true,
      adjustQty: true,
      bin: { select: { id: true, code: true } },
      item: { select: ITEM_REF_SELECT },
    },
    orderBy: { bin: { code: 'asc' } },
  },
} as const;

type SummaryRow = Prisma.StockCountGetPayload<{
  select: typeof SUMMARY_SELECT;
}>;
type DetailRow = Prisma.StockCountGetPayload<{ select: typeof DETAIL_SELECT }>;
type DetailLine = DetailRow['lines'][number];

interface Head {
  status: CountStatus;
  version: number;
}

function codeList(codes: readonly string[]): string {
  const shown = codes.slice(0, 5).join(', ');
  return codes.length > 5 ? `${shown} and ${codes.length - 5} more` : shown;
}

function bodyOf(error: unknown): {
  code?: string;
  itemId?: string;
  bin?: string;
} {
  if (!(error instanceof ConflictException)) return {};
  const body = error.getResponse();
  return typeof body === 'object' ? (body as Record<string, string>) : {};
}

@Injectable()
export class CountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
    private readonly stock: StockPostingService,
    private readonly store: MainStore,
  ) {}

  async scope(): Promise<CountScope> {
    const storeId = await this.store.id();
    const zones = await this.prisma.zone.findMany({
      where: { storeId },
      select: {
        id: true,
        code: true,
        name: true,
        bins: {
          where: { active: true, kind: { in: COUNTABLE_BIN_KINDS } },
          select: {
            id: true,
            code: true,
            kind: true,
            openedAt: true,
            countId: true,
            _count: { select: { stock: { where: { qty: { gt: 0 } } } } },
          },
          orderBy: { code: 'asc' },
        },
      },
      orderBy: { code: 'asc' },
    });
    const countIds = zones.flatMap((z) =>
      z.bins.flatMap((b) => (b.countId ? [b.countId] : [])),
    );
    const counts = countIds.length
      ? await this.prisma.stockCount.findMany({
          where: { id: { in: [...new Set(countIds)] } },
          select: { id: true, number: true },
        })
      : [];
    const numbers = new Map(counts.map((c) => [c.id, c.number]));
    return {
      zones: zones
        .filter((z) => z.bins.length > 0)
        .map((z) => ({
          id: z.id,
          code: z.code,
          name: z.name,
          bins: z.bins.map((b) => ({
            id: b.id,
            code: b.code,
            kind: b.kind === 'QUARANTINE' ? 'QUARANTINE' : 'STORAGE',
            itemCount: b._count.stock,
            opened: b.openedAt !== null,
            countNumber: b.countId ? (numbers.get(b.countId) ?? null) : null,
          })),
        })),
    };
  }

  async list(query: CountQuery): Promise<CountPage> {
    let status: Prisma.StockCountWhereInput = {};
    if (query.status === 'OPEN')
      status = { status: { in: OPEN_COUNT_STATUSES } };
    else if (query.status !== 'ALL') status = { status: query.status };
    const where: Prisma.StockCountWhereInput = {
      AND: [
        status,
        query.kind ? { kind: query.kind } : {},
        query.q
          ? { number: { contains: query.q, mode: 'insensitive' as const } }
          : {},
      ],
    };
    const [rows, total] = await Promise.all([
      this.prisma.stockCount.findMany({
        where,
        select: SUMMARY_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...pageWindow(query),
      }),
      this.prisma.stockCount.count({ where }),
    ]);
    const ids = rows.map((r) => r.id);
    const [counted, names] = await Promise.all([
      ids.length
        ? this.prisma.countLine.groupBy({
            by: ['countId'],
            where: { countId: { in: ids }, countedQty: { not: null } },
            _count: { _all: true },
          })
        : [],
      userNames(
        this.prisma,
        rows.map((r) => r.createdBy),
      ),
    ]);
    const countedOf = new Map(counted.map((c) => [c.countId, c._count._all]));
    return {
      items: rows.map((r) => toSummary(r, countedOf.get(r.id) ?? 0, names)),
      ...pageMeta(query, total),
    };
  }

  async detail(policy: Policy, id: string): Promise<CountDto> {
    const row = await this.prisma.stockCount.findUnique({
      where: { id },
      select: DETAIL_SELECT,
    });
    if (!row) notFound('Count not found.');
    const frozen = OPEN_COUNT_STATUSES.includes(row.status)
      ? await this.prisma.bin.findMany({
          where: { countId: id },
          select: { id: true, code: true },
          orderBy: { code: 'asc' },
        })
      : [];
    const names = await userNames(this.prisma, [
      row.createdBy,
      row.submittedBy,
      row.rejectedBy,
      row.approvedBy,
      row.cancelledBy,
      ...row.lines.map((l) => l.countedBy),
    ]);
    const visible = seesSystemQty(
      row.blind,
      row.status,
      can(policy, 'inventory.count.approve'),
    );
    const bins = new Map<
      string,
      { id: string; code: string; lines: DetailLine[] }
    >();
    for (const bin of frozen) bins.set(bin.id, { ...bin, lines: [] });
    for (const line of row.lines) {
      const bin = bins.get(line.bin.id) ?? { ...line.bin, lines: [] };
      bin.lines.push(line);
      bins.set(bin.id, bin);
    }
    const countedLines = row.lines.filter((l) => l.countedQty !== null).length;
    return {
      ...toSummary(row, countedLines, names),
      notes: row.notes,
      version: row.version,
      systemVisible: visible,
      tookPart: tookPart(
        policy.userId,
        row.submittedBy,
        row.lines.map((l) => l.countedBy),
      ),
      submitted: stampOf(row.submittedBy, row.submittedAt, names),
      sentBack: stampOf(row.rejectedBy, row.rejectedAt, names),
      sendBackReason: row.rejectReason,
      approved: stampOf(row.approvedBy, row.approvedAt, names),
      cancelled: stampOf(row.cancelledBy, row.cancelledAt, names),
      cancelReason: row.cancelReason,
      bins: [...bins.values()]
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((bin) => ({
          id: bin.id,
          code: bin.code,
          lineCount: bin.lines.length,
          countedLines: bin.lines.filter((l) => l.countedQty !== null).length,
          lines: bin.lines
            .sort((a, b) => a.item.partNo.localeCompare(b.item.partNo))
            .map((l) => toLine(l, visible, names)),
        })),
    };
  }

  async create(policy: Policy, input: CountCreate): Promise<CountDto> {
    const storeId = await this.store.id();
    const binIds = await this.scopeBins(storeId, input);
    const id = await this.prisma.$transaction(async (tx) => {
      const { number } = await this.numbering.next(tx, {
        docType: COUNT_DOC_TYPE,
        date: new Date(),
      });
      const count = await tx.stockCount.create({
        data: {
          number,
          kind: input.kind,
          blind: input.blind,
          notes: input.notes ?? null,
          createdBy: policy.userId,
          updatedBy: policy.userId,
        },
        select: { id: true },
      });
      await this.freeze(tx, count.id, binIds, input.kind === 'OPENING');
      const stock = await tx.binStock.findMany({
        where: { binId: { in: binIds }, qty: { gt: 0 } },
        select: { binId: true, itemId: true, qty: true },
      });
      if (stock.length > 0) {
        await tx.countLine.createMany({
          data: stock.map((s) => ({
            countId: count.id,
            binId: s.binId,
            itemId: s.itemId,
            systemQty: s.qty,
          })),
        });
      }
      await this.audit.record(
        auditEntry(COUNT_KEY, count.id, 'create', {
          number,
          kind: input.kind,
          blind: input.blind,
          bins: binIds.length,
          lines: stock.length,
        }),
        tx,
      );
      return count.id;
    }, LONG_TX);
    return this.detail(policy, id);
  }

  private async scopeBins(
    storeId: string,
    input: CountCreate,
  ): Promise<string[]> {
    if (input.kind === 'FULL') {
      const rows = await this.prisma.bin.findMany({
        where: { storeId, active: true, kind: { in: COUNTABLE_BIN_KINDS } },
        select: { id: true },
      });
      if (rows.length === 0) invalid('There are no bins to count.');
      return rows.map((r) => r.id).sort();
    }
    const zoneIds = [...new Set(input.zoneIds)];
    const binIds = [...new Set(input.binIds)];
    if (zoneIds.length === 0 && binIds.length === 0) {
      invalid('Choose the zones or bins to count.', ['zoneIds', 'binIds']);
    }
    const select = {
      id: true,
      code: true,
      kind: true,
      active: true,
      openedAt: true,
    } as const;
    const [zones, picked, zoned] = await Promise.all([
      zoneIds.length
        ? this.prisma.zone.count({ where: { storeId, id: { in: zoneIds } } })
        : 0,
      binIds.length
        ? this.prisma.bin.findMany({
            where: { storeId, id: { in: binIds } },
            select,
          })
        : [],
      zoneIds.length
        ? this.prisma.bin.findMany({
            where: { storeId, zoneId: { in: zoneIds } },
            select,
          })
        : [],
    ]);
    if (zones !== zoneIds.length) invalid('Unknown zone.', ['zoneIds']);
    if (picked.length !== binIds.length) invalid('Unknown bin.', ['binIds']);
    const chosen = new Set<string>();
    for (const bin of picked) {
      const reason = ineligibility(bin, input.kind);
      if (reason) invalid(ineligibleMessage(bin.code, reason), ['binIds']);
      chosen.add(bin.id);
    }
    for (const bin of zoned) {
      if (!ineligibility(bin, input.kind)) chosen.add(bin.id);
    }
    if (chosen.size === 0) {
      invalid(
        input.kind === 'OPENING'
          ? 'Every bin in those zones has already had its opening count.'
          : 'Those zones have no bins that can be counted.',
        ['zoneIds'],
      );
    }
    return [...chosen].sort();
  }

  private async freeze(
    tx: TransactionClient,
    countId: string,
    binIds: string[],
    opening: boolean,
  ): Promise<void> {
    await tx.$queryRaw`
      SELECT id FROM inventory.bin WHERE id = ANY(${binIds}::uuid[]) ORDER BY id FOR UPDATE`;
    const frozen = await tx.$executeRaw`
      UPDATE inventory.bin SET count_id = ${countId}::uuid
      WHERE id = ANY(${binIds}::uuid[]) AND count_id IS NULL
        AND (${opening}::boolean = false OR opened_at IS NULL)`;
    if (frozen === binIds.length) return;
    const blocked = await tx.$queryRaw<
      { code: string; number: string | null }[]
    >`
      SELECT b.code, c.number
      FROM inventory.bin b
      LEFT JOIN inventory.stock_count c ON c.id = b.count_id
      WHERE b.id = ANY(${binIds}::uuid[])
        AND b.count_id IS DISTINCT FROM ${countId}::uuid
      ORDER BY b.code`;
    const busy = blocked.filter((b) => b.number !== null);
    if (busy.length > 0) {
      const numbers = [...new Set(busy.map((b) => b.number))];
      const codes = codeList(busy.map((b) => b.code));
      conflict(
        'BIN_COUNTING',
        busy.length === 1
          ? `Bin ${codes} is already being counted on ${numbers[0]}.`
          : `Bins ${codes} are already being counted on ${numbers.length === 1 ? numbers[0] : 'other counts'}.`,
      );
    }
    conflict(
      'BIN_OPENED',
      `Bins ${codeList(blocked.map((b) => b.code))} have already had their opening count.`,
    );
  }

  async enter(
    policy: Policy,
    id: string,
    input: CountEntry,
  ): Promise<CountDto> {
    await this.guarded(id, 'count', input.version);
    const lineIds = input.lines.map((l) => l.lineId);
    if (new Set(lineIds).size !== lineIds.length) {
      invalid('Each line can only be entered once.', ['lines']);
    }
    const rows = await this.prisma.countLine.findMany({
      where: { countId: id, id: { in: lineIds } },
      select: {
        id: true,
        item: {
          select: { id: true, partNo: true, allowFraction: true, status: true },
        },
      },
    });
    if (rows.length !== lineIds.length) {
      invalid('That line is not on this count.', ['lines']);
    }
    const itemOf = new Map(rows.map((r) => [r.id, r.item]));
    input.lines.forEach((l, i) => {
      const item = itemOf.get(l.lineId);
      if (item && l.countedQty !== null) {
        checkQty(item, l.countedQty, `lines.${i}.countedQty`);
      }
    });
    await this.prisma.$transaction(async (tx) => {
      await this.claim(tx, id, 'count', input.version, policy.userId, {});
      const now = new Date();
      for (const l of input.lines) {
        const counted = l.countedQty !== null;
        await tx.countLine.update({
          where: { id: l.lineId },
          data: {
            countedQty: counted ? qtyString(l.countedQty ?? 0) : null,
            countedBy: counted ? policy.userId : null,
            countedAt: counted ? now : null,
          },
        });
      }
      await this.audit.record(
        auditEntry(COUNT_KEY, id, 'counted', {
          lines: input.lines.map((l) => ({
            lineId: l.lineId,
            countedQty: l.countedQty === null ? null : qtyString(l.countedQty),
          })),
        }),
        tx,
      );
    }, LONG_TX);
    return this.detail(policy, id);
  }

  async addLine(
    policy: Policy,
    id: string,
    input: CountAddLine,
  ): Promise<CountDto> {
    await this.guarded(id, 'count', input.version);
    const [bin, items, current] = await Promise.all([
      this.prisma.bin.findUnique({
        where: { id: input.binId },
        select: { code: true, countId: true },
      }),
      loadItems(this.prisma, [input.itemId]),
      this.prisma.binStock.findUnique({
        where: {
          binId_itemId: { binId: input.binId, itemId: input.itemId },
        },
        select: { qty: true },
      }),
    ]);
    if (!bin || bin.countId !== id) {
      invalid('That bin is not part of this count.', ['binId']);
    }
    const item = items.get(input.itemId);
    if (!item) invalid('Unknown item.', ['itemId']);
    checkQty(item, input.countedQty, 'countedQty');
    try {
      await this.prisma.$transaction(async (tx) => {
        await this.claim(tx, id, 'count', input.version, policy.userId, {});
        const line = await tx.countLine.create({
          data: {
            countId: id,
            binId: input.binId,
            itemId: input.itemId,
            systemQty: qtyString(current?.qty ?? 0),
            countedQty: qtyString(input.countedQty),
            countedBy: policy.userId,
            countedAt: new Date(),
            added: true,
          },
          select: { id: true },
        });
        await this.audit.record(
          auditEntry(COUNT_KEY, id, 'line_added', {
            lineId: line.id,
            binId: input.binId,
            itemId: input.itemId,
            countedQty: qtyString(input.countedQty),
          }),
          tx,
        );
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        conflict(
          'LINE_EXISTS',
          `${item.partNo} is already on the sheet for bin ${bin.code}. Enter its count there.`,
        );
      }
      throw error;
    }
    return this.detail(policy, id);
  }

  async removeLine(
    policy: Policy,
    id: string,
    lineId: string,
    version: number,
  ): Promise<CountDto> {
    await this.guarded(id, 'count', version);
    const line = await this.prisma.countLine.findFirst({
      where: { id: lineId, countId: id },
      select: { added: true, binId: true, itemId: true },
    });
    if (!line) notFound('That line is not on this count.');
    if (!line.added) {
      invalid(
        'Only a part added during the count can be removed. Enter 0 if none are there.',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await this.claim(tx, id, 'count', version, policy.userId, {});
      await tx.countLine.delete({ where: { id: lineId } });
      await this.audit.record(
        auditEntry(COUNT_KEY, id, 'line_removed', null, {
          before: { lineId, binId: line.binId, itemId: line.itemId },
        }),
        tx,
      );
    });
    return this.detail(policy, id);
  }

  async submit(policy: Policy, id: string, version: number): Promise<CountDto> {
    await this.guarded(id, 'submit', version);
    await this.prisma.$transaction(async (tx) => {
      await this.claim(tx, id, 'submit', version, policy.userId, {
        status: 'SUBMITTED',
        submittedBy: policy.userId,
        submittedAt: new Date(),
      });
      const lines = await tx.countLine.findMany({
        where: { countId: id },
        select: { countedQty: true },
      });
      const left = uncounted(lines);
      if (left > 0) {
        conflict(
          'NOT_COUNTED',
          left === 1
            ? '1 line has not been counted yet.'
            : `${left} lines have not been counted yet.`,
        );
      }
      await this.audit.record(
        auditEntry(
          COUNT_KEY,
          id,
          'submitted',
          { status: 'SUBMITTED' },
          { before: { status: 'COUNTING' } },
        ),
        tx,
      );
    });
    return this.detail(policy, id);
  }

  async approve(
    policy: Policy,
    id: string,
    version: number,
  ): Promise<CountDto> {
    const count = await this.prisma.stockCount.findUnique({
      where: { id },
      select: {
        status: true,
        version: true,
        kind: true,
        number: true,
        submittedBy: true,
        lines: { select: { countedBy: true } },
      },
    });
    if (!count) notFound('Count not found.');
    this.guard('approve', count, version);
    assertNotSelfApproval(
      policy.userId,
      count.submittedBy,
      count.lines.map((l) => l.countedBy),
    );
    await this.prisma.$transaction(async (tx) => {
      await this.claim(tx, id, 'approve', version, policy.userId, {
        status: 'POSTED',
        approvedBy: policy.userId,
        approvedAt: new Date(),
      });
      const adjustments = await this.postDifferences(
        tx,
        { id, number: count.number, kind: count.kind },
        policy.userId,
      );
      if (count.kind === 'OPENING') {
        await tx.$executeRaw`
          UPDATE inventory.bin SET opened_at = now() WHERE count_id = ${id}::uuid`;
      }
      await this.unfreeze(tx, id);
      await this.audit.record(
        auditEntry(
          COUNT_KEY,
          id,
          'approved',
          { status: 'POSTED', adjustments },
          { before: { status: 'SUBMITTED' } },
        ),
        tx,
      );
    }, LONG_TX);
    return this.detail(policy, id);
  }

  private async postDifferences(
    tx: TransactionClient,
    count: { id: string; number: string; kind: CountKind },
    actorId: string,
  ): Promise<{ binId: string; itemId: string; qty: string }[]> {
    const lines = await tx.countLine.findMany({
      where: { countId: count.id },
      select: {
        id: true,
        binId: true,
        itemId: true,
        countedQty: true,
        bin: { select: { code: true } },
        item: { select: { partNo: true } },
      },
    });
    if (uncounted(lines) > 0) {
      conflict('NOT_COUNTED', 'Some lines on this count have no quantity.');
    }
    const stock = await tx.binStock.findMany({
      where: { binId: { in: [...new Set(lines.map((l) => l.binId))] } },
      select: { binId: true, itemId: true, qty: true },
    });
    const current = new Map(
      stock.map((s) => [`${s.binId}:${s.itemId}`, s.qty]),
    );
    const diffs = lines.map((l) => ({
      line: l,
      qty: difference(
        l.countedQty ?? 0,
        current.get(`${l.binId}:${l.itemId}`) ?? 0,
      ),
    }));
    const movements: Movement[] = diffs
      .filter((d) => !d.qty.isZero())
      .map((d) => ({
        itemId: d.line.itemId,
        binId: d.line.binId,
        qty: qtyString(d.qty),
        movement: count.kind === 'OPENING' ? 'OPENING' : 'COUNT_ADJUST',
        docType: COUNT_DOC_TYPE,
        docId: count.id,
        docLineId: d.line.id,
        docNumber: count.number,
      }));
    try {
      await this.stock.post(tx, movements, actorId);
    } catch (error) {
      const body = bodyOf(error);
      if (body.code === 'INSUFFICIENT_STOCK') {
        const line = lines.find(
          (l) => l.itemId === body.itemId && l.bin.code === body.bin,
        );
        conflict(
          'INSUFFICIENT_STOCK',
          line
            ? `The count shows less of ${line.item.partNo} in ${line.bin.code} than is reserved or quarantined. Release holds or requests first.`
            : 'The count shows less of a part than is reserved or quarantined. Release holds or requests first.',
        );
      }
      throw error;
    }
    if (diffs.length > 0) {
      const ids = diffs.map((d) => d.line.id);
      const qtys = diffs.map((d) => qtyString(d.qty));
      await tx.$executeRaw`
        UPDATE inventory.count_line AS l SET adjust_qty = v.qty
        FROM unnest(${ids}::uuid[], ${qtys}::numeric[]) AS v(id, qty)
        WHERE l.id = v.id`;
    }
    return movements.map((m) => ({
      binId: m.binId,
      itemId: m.itemId,
      qty: qtyString(m.qty),
    }));
  }

  async sendBack(
    policy: Policy,
    id: string,
    input: CountReason,
  ): Promise<CountDto> {
    await this.guarded(id, 'send_back', input.version);
    await this.prisma.$transaction(async (tx) => {
      await this.claim(tx, id, 'send_back', input.version, policy.userId, {
        status: 'COUNTING',
        rejectedBy: policy.userId,
        rejectedAt: new Date(),
        rejectReason: input.reason,
      });
      await this.audit.record(
        auditEntry(
          COUNT_KEY,
          id,
          'sent_back',
          { status: 'COUNTING' },
          { before: { status: 'SUBMITTED' }, reason: input.reason },
        ),
        tx,
      );
    });
    return this.detail(policy, id);
  }

  async cancel(
    policy: Policy,
    id: string,
    input: CountReason,
  ): Promise<CountDto> {
    const before = await this.guarded(id, 'cancel', input.version);
    await this.prisma.$transaction(async (tx) => {
      await this.claim(tx, id, 'cancel', input.version, policy.userId, {
        status: 'CANCELLED',
        cancelledBy: policy.userId,
        cancelledAt: new Date(),
        cancelReason: input.reason,
      });
      const released = await this.unfreeze(tx, id);
      await this.audit.record(
        auditEntry(
          COUNT_KEY,
          id,
          'cancelled',
          { status: 'CANCELLED', binsReleased: released },
          { before: { status: before.status }, reason: input.reason },
        ),
        tx,
      );
    });
    return this.detail(policy, id);
  }

  private unfreeze(tx: TransactionClient, id: string): Promise<number> {
    return tx.$executeRaw`
      UPDATE inventory.bin SET count_id = NULL WHERE count_id = ${id}::uuid`;
  }

  private async guarded(
    id: string,
    action: CountAction,
    version: number,
  ): Promise<Head> {
    const row = await this.prisma.stockCount.findUnique({
      where: { id },
      select: { status: true, version: true },
    });
    if (!row) notFound('Count not found.');
    this.guard(action, row, version);
    return row;
  }

  private guard(action: CountAction, row: Head, version: number): void {
    assertCountAction(action, row.status);
    if (row.version !== version) stale();
  }

  private async claim(
    tx: TransactionClient,
    id: string,
    action: CountAction,
    version: number,
    userId: string,
    data: Prisma.StockCountUncheckedUpdateManyInput,
  ): Promise<void> {
    const claimed = await tx.stockCount.updateMany({
      where: { id, version, status: { in: COUNT_ALLOWED_FROM[action] } },
      data: { ...data, version: { increment: 1 }, updatedBy: userId },
    });
    if (claimed.count === 0) stale();
  }
}

function toSummary(
  row: SummaryRow,
  countedLines: number,
  names: ReadonlyMap<string, string>,
) {
  return {
    id: row.id,
    number: row.number,
    kind: row.kind,
    status: row.status,
    blind: row.blind,
    lineCount: row._count.lines,
    countedLines,
    createdBy: names.get(row.createdBy) ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function toLine(
  line: DetailLine,
  visible: boolean,
  names: ReadonlyMap<string, string>,
) {
  const counted = line.countedQty === null ? null : qtyString(line.countedQty);
  const diff =
    line.adjustQty !== null
      ? qtyString(line.adjustQty)
      : counted === null
        ? null
        : qtyString(difference(counted, line.systemQty));
  return {
    id: line.id,
    item: toItemRef(line.item),
    ...(visible
      ? { systemQty: qtyString(line.systemQty), difference: diff }
      : {}),
    countedQty: counted,
    counted: stampOf(line.countedBy, line.countedAt, names),
    added: line.added,
  };
}
