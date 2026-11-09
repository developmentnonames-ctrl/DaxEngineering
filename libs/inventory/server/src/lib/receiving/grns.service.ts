import { ConflictException, Injectable } from '@nestjs/common';
import type {
  GrnCreate,
  GrnDto,
  GrnLineInput,
  GrnPage,
  GrnQuery,
  GrnUpdate,
  ReceivingSummary,
} from '@dax/inventory-contract';
import {
  AuditService,
  EventBus,
  NumberingService,
  type Policy,
} from '@dax/platform-core';
import {
  Prisma,
  PrismaService,
  type TransactionClient,
} from '@dax/platform-db';
import {
  conflict,
  encodeCursor,
  invalid,
  notFound,
  pageFrom,
  stale,
} from '../common';
import { MainStore } from '../main-store.service';
import { dec, qtyString } from '../stock-math';
import { goodsReceived, grnReversed } from '../stock/events';
import {
  type Movement,
  StockPostingService,
} from '../stock/stock-posting.service';
import {
  assertGrnAction,
  GRN_ALLOWED_FROM,
  type GrnAction,
  type GrnStatus,
  hasSomethingReceived,
  lineDiscrepancies,
  OPEN_GRN_STATUSES,
  toPutAway,
  UNPOSTED_GRN_STATUSES,
} from './rules';
import {
  activeSupplier,
  auditEntry,
  checkQty,
  createdBefore,
  dateToDay,
  dayToDate,
  GRN_DOC_TYPE,
  GRN_KEY,
  ITEM_REF_SELECT,
  loadItems,
  requireItem,
  specialBins,
  stampOf,
  toItemRef,
  userNames,
} from './shared';

const SUMMARY_SELECT = {
  id: true,
  number: true,
  subtype: true,
  status: true,
  supplierId: true,
  supplierName: true,
  createdAt: true,
  postedAt: true,
  _count: {
    select: { lines: true, discrepancies: { where: { status: 'OPEN' } } },
  },
} as const;

const DETAIL_SELECT = {
  ...SUMMARY_SELECT,
  deliveryNote: true,
  deliveryDate: true,
  notes: true,
  checkedBy: true,
  checkedAt: true,
  postedBy: true,
  reversedBy: true,
  reversedAt: true,
  reverseReason: true,
  version: true,
  lines: {
    select: {
      id: true,
      lineNo: true,
      qtyExpected: true,
      qtyGood: true,
      qtyDamaged: true,
      qtyPutAway: true,
      wrongItem: true,
      notes: true,
      item: {
        select: {
          ...ITEM_REF_SELECT,
          defaultBin: { select: { id: true, code: true } },
        },
      },
    },
    orderBy: { lineNo: 'asc' },
  },
  discrepancies: {
    select: { id: true, kind: true, qty: true, status: true, itemId: true },
    orderBy: { id: 'asc' },
  },
} as const;

const EDIT_LINE_SELECT = {
  id: true,
  itemId: true,
  qtyExpected: true,
  qtyGood: true,
  qtyDamaged: true,
  wrongItem: true,
  notes: true,
} as const;

type SummaryRow = Prisma.GrnGetPayload<{ select: typeof SUMMARY_SELECT }>;
type DetailRow = Prisma.GrnGetPayload<{ select: typeof DETAIL_SELECT }>;
type EditLine = Prisma.GrnLineGetPayload<{ select: typeof EDIT_LINE_SELECT }>;

export interface LinePlan {
  id: string | null;
  lineNo: number;
  itemId: string;
  qtyExpected: string | null;
  qtyGood: string;
  qtyDamaged: string;
  wrongItem: boolean;
  notes: string | null;
}

function toSummary(row: SummaryRow) {
  return {
    id: row.id,
    number: row.number,
    subtype: row.subtype,
    status: row.status,
    supplier: { id: row.supplierId, name: row.supplierName },
    lineCount: row._count.lines,
    openDiscrepancies: row._count.discrepancies,
    createdAt: row.createdAt.toISOString(),
    postedAt: row.postedAt?.toISOString() ?? null,
  };
}

function statusFilter(status: GrnQuery['status']) {
  if (status === 'ALL') return {};
  if (status === 'OPEN') return { status: { in: OPEN_GRN_STATUSES } };
  return { status };
}

function search(q: string | undefined) {
  if (!q) return {};
  const like = { contains: q, mode: 'insensitive' as const };
  return {
    OR: [{ number: like }, { supplierName: like }, { deliveryNote: like }],
  };
}

function postedNumber(number: string | null): string {
  if (!number) throw new Error('A posted GRN has no number.');
  return number;
}

function isInsufficientStock(error: unknown): boolean {
  if (!(error instanceof ConflictException)) return false;
  const body = error.getResponse();
  return (
    typeof body === 'object' &&
    (body as { code?: unknown }).code === 'INSUFFICIENT_STOCK'
  );
}

@Injectable()
export class GrnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
    private readonly events: EventBus,
    private readonly stock: StockPostingService,
    private readonly store: MainStore,
  ) {}

  async list(query: GrnQuery): Promise<GrnPage> {
    const rows = await this.prisma.grn.findMany({
      where: {
        AND: [
          statusFilter(query.status),
          search(query.q),
          createdBefore(query.cursor),
        ],
      },
      select: SUMMARY_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const page = pageFrom(rows, query.limit, (r) =>
      encodeCursor(r.createdAt.toISOString(), r.id),
    );
    return { items: page.rows.map(toSummary), nextCursor: page.nextCursor };
  }

  async detail(id: string): Promise<GrnDto> {
    const row = await this.prisma.grn.findUnique({
      where: { id },
      select: DETAIL_SELECT,
    });
    if (!row) notFound('GRN not found.');
    return this.toDetail(row);
  }

  private async toDetail(row: DetailRow): Promise<GrnDto> {
    const names = await userNames(this.prisma, [
      row.checkedBy,
      row.postedBy,
      row.reversedBy,
    ]);
    const reversed = stampOf(row.reversedBy, row.reversedAt, names);
    return {
      ...toSummary(row),
      deliveryNote: row.deliveryNote,
      deliveryDate: dateToDay(row.deliveryDate),
      notes: row.notes,
      checked: stampOf(row.checkedBy, row.checkedAt, names),
      posted: stampOf(row.postedBy, row.postedAt, names),
      reversed: reversed ? { ...reversed, reason: row.reverseReason } : null,
      version: row.version,
      lines: row.lines.map((l) => ({
        id: l.id,
        lineNo: l.lineNo,
        item: toItemRef(l.item),
        qtyExpected: l.qtyExpected === null ? null : qtyString(l.qtyExpected),
        qtyGood: qtyString(l.qtyGood),
        qtyDamaged: qtyString(l.qtyDamaged),
        qtyPutAway: qtyString(l.qtyPutAway),
        toPutAway: qtyString(toPutAway(l.qtyGood, l.qtyPutAway)),
        wrongItem: l.wrongItem,
        notes: l.notes,
        defaultBin: l.item.defaultBin,
      })),
      discrepancies: row.discrepancies.map((d) => ({
        id: d.id,
        kind: d.kind,
        qty: qtyString(d.qty),
        status: d.status,
        itemId: d.itemId,
      })),
    };
  }

  async summary(): Promise<ReceivingSummary> {
    const [drafts, awaitingPutaway, openDiscrepancies] = await Promise.all([
      this.prisma.grn.count({
        where: { status: { in: UNPOSTED_GRN_STATUSES } },
      }),
      this.prisma.grn.count({ where: { status: 'POSTED' } }),
      this.prisma.discrepancy.count({ where: { status: 'OPEN' } }),
    ]);
    return { drafts, awaitingPutaway, openDiscrepancies };
  }

  async create(policy: Policy, input: GrnCreate): Promise<GrnDto> {
    const supplier = await activeSupplier(this.prisma, input.supplierId);
    const id = await this.prisma.$transaction(async (tx) => {
      const created = await tx.grn.create({
        data: {
          subtype: supplier.isForeign ? 'FOR' : 'LOC',
          supplierId: supplier.id,
          supplierName: supplier.name,
          deliveryNote: input.deliveryNote ?? null,
          deliveryDate: dayToDate(input.deliveryDate) ?? null,
          createdBy: policy.userId,
          updatedBy: policy.userId,
        },
        select: { id: true, subtype: true },
      });
      await this.audit.record(
        auditEntry(GRN_KEY, created.id, 'create', {
          supplierId: supplier.id,
          subtype: created.subtype,
          deliveryNote: input.deliveryNote ?? null,
          deliveryDate: input.deliveryDate ?? null,
        }),
        tx,
      );
      return created.id;
    });
    return this.detail(id);
  }

  async update(policy: Policy, id: string, input: GrnUpdate): Promise<GrnDto> {
    const before = await this.prisma.grn.findUnique({
      where: { id },
      select: {
        status: true,
        version: true,
        subtype: true,
        deliveryNote: true,
        deliveryDate: true,
        notes: true,
        lines: { select: EDIT_LINE_SELECT, orderBy: { lineNo: 'asc' } },
      },
    });
    if (!before) notFound('GRN not found.');
    this.guard('edit', before, input.version);
    const plan = input.lines
      ? await this.planLines(before.lines, input.lines)
      : null;

    const changes: Record<string, unknown> = {};
    if (input.subtype !== undefined) changes['subtype'] = input.subtype;
    if (input.deliveryNote !== undefined)
      changes['deliveryNote'] = input.deliveryNote;
    if (input.notes !== undefined) changes['notes'] = input.notes;
    const deliveryDate = dayToDate(input.deliveryDate);
    if (deliveryDate !== undefined) changes['deliveryDate'] = deliveryDate;

    await this.prisma.$transaction(async (tx) => {
      await this.claim(tx, id, 'edit', input.version, policy.userId, {
        ...changes,
        status: 'DRAFT',
        checkedBy: null,
        checkedAt: null,
      });
      if (plan) await replaceLines(tx, id, before.lines, plan);
      const beforeValues: Record<string, unknown> = { status: before.status };
      for (const key of Object.keys(changes)) {
        beforeValues[key] = before[key as keyof typeof before];
      }
      const afterValues: Record<string, unknown> = {
        ...changes,
        status: 'DRAFT',
      };
      if (plan) {
        beforeValues['lines'] = before.lines.map(lineAudit);
        afterValues['lines'] = plan.map(lineAudit);
      }
      await this.audit.record(
        auditEntry(GRN_KEY, id, 'update', afterValues, {
          before: beforeValues,
        }),
        tx,
      );
    });
    return this.detail(id);
  }

  async planLines(
    existing: readonly EditLine[],
    inputs: readonly GrnLineInput[],
  ): Promise<LinePlan[]> {
    const current = new Map(existing.map((l) => [l.id, l]));
    const items = await loadItems(
      this.prisma,
      inputs.map((l) => l.itemId),
    );
    const seenIds = new Set<string>();

    return inputs.map((line, i): LinePlan => {
      const field = (name: string) => `lines.${i}.${name}`;
      const prev = line.id ? current.get(line.id) : undefined;
      if (line.id && (!prev || seenIds.has(line.id))) {
        invalid('That line is not on this GRN.', [field('id')]);
      }
      if (prev) seenIds.add(prev.id);
      const item = requireItem(
        items,
        line.itemId,
        field('itemId'),
        prev?.itemId !== line.itemId,
      );
      const qtyExpected =
        line.qtyExpected !== undefined
          ? line.qtyExpected
          : (prev?.qtyExpected ?? null);
      if (qtyExpected !== null) {
        checkQty(item, qtyExpected, field('qtyExpected'));
      }
      checkQty(item, line.qtyGood, field('qtyGood'));
      checkQty(item, line.qtyDamaged, field('qtyDamaged'));
      return {
        id: prev?.id ?? null,
        lineNo: i + 1,
        itemId: line.itemId,
        qtyExpected: qtyExpected === null ? null : qtyString(qtyExpected),
        qtyGood: qtyString(line.qtyGood),
        qtyDamaged: qtyString(line.qtyDamaged),
        wrongItem: line.wrongItem,
        notes: line.notes ?? null,
      };
    });
  }

  async check(policy: Policy, id: string, version: number): Promise<GrnDto> {
    const before = await this.prisma.grn.findUnique({
      where: { id },
      select: {
        status: true,
        version: true,
        lines: {
          select: {
            qtyExpected: true,
            qtyGood: true,
            qtyDamaged: true,
            wrongItem: true,
          },
        },
      },
    });
    if (!before) notFound('GRN not found.');
    this.guard('check', before, version);
    if (!hasSomethingReceived(before.lines)) {
      invalid('Enter what was received on at least one line first.', ['lines']);
    }
    await this.prisma.$transaction(async (tx) => {
      await this.claim(tx, id, 'check', version, policy.userId, {
        status: 'CHECKED',
        checkedBy: policy.userId,
        checkedAt: new Date(),
      });
      await this.audit.record(
        auditEntry(
          GRN_KEY,
          id,
          'checked',
          { status: 'CHECKED' },
          { before: { status: before.status } },
        ),
        tx,
      );
    });
    return this.detail(id);
  }

  async post(policy: Policy, id: string, version: number): Promise<GrnDto> {
    const before = await this.prisma.grn.findUnique({
      where: { id },
      select: { status: true, version: true },
    });
    if (!before) notFound('GRN not found.');
    this.guard('post', before, version);
    const bins = await specialBins(this.prisma, await this.store.id());

    await this.prisma.$transaction(async (tx) => {
      await this.claim(tx, id, 'post', version, policy.userId, {});
      const grn = await tx.grn.findUniqueOrThrow({
        where: { id },
        select: {
          subtype: true,
          supplierId: true,
          lines: { select: EDIT_LINE_SELECT, orderBy: { lineNo: 'asc' } },
        },
      });
      if (!hasSomethingReceived(grn.lines)) {
        invalid('Enter what was received on at least one line first.', [
          'lines',
        ]);
      }
      const lines = grn.lines;
      const now = new Date();
      const { number } = await this.numbering.next(tx, {
        docType: GRN_DOC_TYPE,
        subtype: grn.subtype,
        date: now,
      });
      const nothingToPutAway = lines.every((l) => dec(l.qtyGood).isZero());
      await tx.grn.update({
        where: { id },
        data: {
          status: nothingToPutAway ? 'PUT_AWAY' : 'POSTED',
          number,
          postedBy: policy.userId,
          postedAt: now,
        },
      });

      const movements: Movement[] = lines.flatMap((l) => {
        const base = {
          itemId: l.itemId,
          docType: GRN_DOC_TYPE,
          docId: id,
          docLineId: l.id,
          docNumber: number,
        };
        return [
          {
            ...base,
            binId: bins.receiving,
            qty: dec(l.qtyGood),
            movement: 'RECEIVE' as const,
          },
          {
            ...base,
            binId: bins.quarantine,
            qty: dec(l.qtyDamaged),
            movement: 'RECEIVE_DAMAGED' as const,
          },
        ].filter((m) => m.qty.gt(0));
      });
      await this.stock.post(tx, movements, policy.userId);

      const discrepancies = lines.flatMap((l) =>
        lineDiscrepancies(l).map((d) => ({
          grnId: id,
          grnLineId: l.id,
          itemId: l.itemId,
          kind: d.kind,
          qty: d.qty,
          createdBy: policy.userId,
        })),
      );
      if (discrepancies.length > 0) {
        await tx.discrepancy.createMany({ data: discrepancies });
      }

      await this.events.publish(tx, goodsReceived, {
        grnId: id,
        number,
        supplierId: grn.supplierId,
        lines: lines.map((l) => ({
          itemId: l.itemId,
          qtyGood: qtyString(l.qtyGood),
          qtyDamaged: qtyString(l.qtyDamaged),
        })),
      });
      await this.audit.record(
        auditEntry(
          GRN_KEY,
          id,
          'posted',
          {
            status: nothingToPutAway ? 'PUT_AWAY' : 'POSTED',
            number,
            lines: lines.map(lineAudit),
            discrepancies: discrepancies.map((d) => ({
              itemId: d.itemId,
              kind: d.kind,
              qty: d.qty,
            })),
          },
          { before: { status: 'CHECKED' } },
        ),
        tx,
      );
    });
    return this.detail(id);
  }

  async cancel(policy: Policy, id: string, version: number): Promise<GrnDto> {
    const before = await this.prisma.grn.findUnique({
      where: { id },
      select: { status: true, version: true },
    });
    if (!before) notFound('GRN not found.');
    this.guard('cancel', before, version);
    await this.prisma.$transaction(async (tx) => {
      await this.claim(tx, id, 'cancel', version, policy.userId, {
        status: 'CANCELLED',
      });
      await this.audit.record(
        auditEntry(
          GRN_KEY,
          id,
          'cancelled',
          { status: 'CANCELLED' },
          { before: { status: before.status } },
        ),
        tx,
      );
    });
    return this.detail(id);
  }

  async reverse(
    policy: Policy,
    id: string,
    input: { version: number; reason: string },
  ): Promise<GrnDto> {
    const before = await this.prisma.grn.findUnique({
      where: { id },
      select: { status: true, version: true },
    });
    if (!before) notFound('GRN not found.');
    this.guard('reverse', before, input.version);

    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      await this.claim(tx, id, 'reverse', input.version, policy.userId, {
        status: 'REVERSED',
        reversedBy: policy.userId,
        reversedAt: now,
        reverseReason: input.reason,
      });
      const grn = await tx.grn.findUniqueOrThrow({
        where: { id },
        select: { number: true },
      });
      const number = postedNumber(grn.number);
      const ledger = await tx.stockLedger.findMany({
        where: {
          docType: GRN_DOC_TYPE,
          docId: id,
          movement: { not: 'REVERSAL' },
        },
        select: {
          id: true,
          itemId: true,
          binId: true,
          qty: true,
          docLineId: true,
        },
      });
      // Undo withdrawals before receipts so no bin dips below zero part-way through.
      const movements: Movement[] = ledger
        .map((row) => ({
          itemId: row.itemId,
          binId: row.binId,
          qty: dec(row.qty).neg(),
          movement: 'REVERSAL' as const,
          docType: GRN_DOC_TYPE,
          docId: id,
          docLineId: row.docLineId,
          docNumber: number,
          reversalOf: row.id,
        }))
        .sort((a, b) => Number(b.qty.gt(0)) - Number(a.qty.gt(0)));
      try {
        await this.stock.post(tx, movements, policy.userId);
      } catch (error) {
        if (isInsufficientStock(error)) {
          conflict(
            'GRN_STOCK_USED',
            "Some of this stock has already been used, so the GRN can't be reversed.",
          );
        }
        throw error;
      }

      const closed = await tx.discrepancy.updateMany({
        where: { grnId: id, status: 'OPEN' },
        data: {
          status: 'CLOSED',
          closeNote: 'GRN reversed',
          closedBy: policy.userId,
          closedAt: now,
          version: { increment: 1 },
        },
      });
      await this.events.publish(tx, grnReversed, { grnId: id, number });
      await this.audit.record(
        auditEntry(
          GRN_KEY,
          id,
          'reversed',
          {
            status: 'REVERSED',
            movements: movements.length,
            discrepanciesClosed: closed.count,
          },
          { before: { status: before.status }, reason: input.reason },
        ),
        tx,
      );
    });
    return this.detail(id);
  }

  private guard(
    action: GrnAction,
    row: { status: GrnStatus; version: number },
    version: number,
  ): void {
    assertGrnAction(action, row.status);
    if (row.version !== version) stale();
  }

  private async claim(
    tx: TransactionClient,
    id: string,
    action: GrnAction,
    version: number,
    userId: string,
    data: Prisma.GrnUncheckedUpdateManyInput,
  ): Promise<void> {
    const claimed = await tx.grn.updateMany({
      where: { id, version, status: { in: GRN_ALLOWED_FROM[action] } },
      data: { ...data, version: { increment: 1 }, updatedBy: userId },
    });
    if (claimed.count === 0) stale();
  }
}

function lineAudit(line: {
  itemId: string;
  qtyExpected: Prisma.Decimal | string | null;
  qtyGood: Prisma.Decimal | string;
  qtyDamaged: Prisma.Decimal | string;
  wrongItem: boolean;
}) {
  return {
    itemId: line.itemId,
    qtyExpected: line.qtyExpected === null ? null : qtyString(line.qtyExpected),
    qtyGood: qtyString(line.qtyGood),
    qtyDamaged: qtyString(line.qtyDamaged),
    wrongItem: line.wrongItem,
  };
}

async function replaceLines(
  tx: TransactionClient,
  grnId: string,
  existing: readonly EditLine[],
  plan: readonly LinePlan[],
): Promise<void> {
  const kept = new Set(plan.flatMap((p) => (p.id ? [p.id] : [])));
  const dropped = existing.filter((l) => !kept.has(l.id)).map((l) => l.id);
  if (dropped.length > 0) {
    await tx.grnLine.deleteMany({ where: { id: { in: dropped } } });
  }
  // Line numbers are unique per GRN, so park the kept ones out of the way first.
  await tx.$executeRaw`UPDATE inventory.grn_line SET line_no = -line_no WHERE grn_id = ${grnId}::uuid`;
  const fresh: Prisma.GrnLineCreateManyInput[] = [];
  for (const p of plan) {
    const data = {
      lineNo: p.lineNo,
      itemId: p.itemId,
      qtyExpected: p.qtyExpected,
      qtyGood: p.qtyGood,
      qtyDamaged: p.qtyDamaged,
      wrongItem: p.wrongItem,
      notes: p.notes,
    };
    if (p.id) await tx.grnLine.update({ where: { id: p.id }, data });
    else fresh.push({ ...data, grnId });
  }
  if (fresh.length > 0) await tx.grnLine.createMany({ data: fresh });
}
