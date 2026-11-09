import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type {
  HoldConvert,
  IssuingSummary,
  MrnAllocate,
  MrnDto,
  MrnInput,
  MrnPage,
  MrnQuery,
  MrnUpdate,
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
  encodeCursor,
  invalid,
  notFound,
  pageFrom,
  stale,
} from '../common';
import { MainStore } from '../main-store.service';
import {
  auditEntry,
  checkQty,
  createdBefore,
  type Db,
  ITEM_REF_SELECT,
  loadItems,
  requireItem,
  stampOf,
  toItemRef,
  userNames,
} from '../receiving/shared';
import { dec, qtyString, stockFigures } from '../stock-math';
import { StockPostingService } from '../stock/stock-posting.service';
import {
  assertHoldActive,
  assertMrnAction,
  canClose,
  MRN_ALLOWED_FROM,
  type MrnAction,
  type MrnStatus,
  OPEN_MRN_STATUSES,
  outstandingQty,
  toReserve,
  waitingQty,
} from './rules';
import {
  activeCustomer,
  activeDepartment,
  AOD_KEY,
  aodScope,
  customerRef,
  failedGates,
  HOLD_KEY,
  holdScope,
  MRN_KEY,
  MRN_RELEASE_GATES,
  type MrnReleaseGate,
  mrnScope,
  notEnoughFor,
  seesMrnCustomer,
} from './shared';

const RESERVABLE: MrnStatus[] = ['CHECKED', 'READY', 'PARTLY_ISSUED'];

const LINE_QTY_SELECT = {
  id: true,
  itemId: true,
  qtyRequested: true,
  qtyIssued: true,
  qtyShortClosed: true,
} as const;

const SUMMARY_SELECT = {
  id: true,
  number: true,
  subtype: true,
  status: true,
  departmentId: true,
  departmentName: true,
  customerId: true,
  customerName: true,
  jobNumber: true,
  createdAt: true,
  lines: { select: LINE_QTY_SELECT },
} as const;

const DETAIL_SELECT = {
  ...SUMMARY_SELECT,
  customerPo: true,
  quotationRef: true,
  notes: true,
  holdId: true,
  submittedBy: true,
  submittedAt: true,
  checkedBy: true,
  checkedAt: true,
  closedBy: true,
  closedAt: true,
  closeReason: true,
  version: true,
  lines: {
    select: {
      ...LINE_QTY_SELECT,
      lineNo: true,
      notes: true,
      item: { select: ITEM_REF_SELECT },
    },
    orderBy: { lineNo: 'asc' },
  },
  aods: {
    select: { id: true, number: true, type: true, status: true },
    orderBy: { createdAt: 'asc' },
  },
} as const;

type SummaryRow = Prisma.MrnGetPayload<{ select: typeof SUMMARY_SELECT }>;
type DetailRow = Prisma.MrnGetPayload<{ select: typeof DETAIL_SELECT }>;
type QtyLine = Prisma.MrnLineGetPayload<{ select: typeof LINE_QTY_SELECT }>;

export async function reservationsOf(
  db: Db,
  lineIds: readonly string[],
): Promise<Map<string, Prisma.Decimal>> {
  if (lineIds.length === 0) return new Map();
  const rows = await db.reservation.findMany({
    where: { source: 'MRN', sourceLineId: { in: [...lineIds] } },
    select: { sourceLineId: true, qty: true },
  });
  return new Map(rows.map((r) => [r.sourceLineId, dec(r.qty)]));
}

export async function waitingMrnIds(db: Db): Promise<string[]> {
  const rows = await db.$queryRaw<{ mrn_id: string }[]>`
    SELECT DISTINCT l.mrn_id FROM inventory.mrn_line l
    JOIN inventory.mrn m ON m.id = l.mrn_id
    LEFT JOIN inventory.reservation r ON r.source = 'MRN' AND r.source_line_id = l.id
    WHERE m.status IN ('CHECKED', 'READY', 'PARTLY_ISSUED')
      AND l.qty_requested - l.qty_issued - l.qty_short_closed - COALESCE(r.qty, 0) > 0`;
  return rows.map((r) => r.mrn_id);
}

function lineWaiting(
  status: MrnStatus,
  line: QtyLine,
  reserved: ReadonlyMap<string, Prisma.Decimal>,
): Prisma.Decimal {
  if (!RESERVABLE.includes(status)) return dec(0);
  return waitingQty(line, reserved.get(line.id) ?? 0);
}

function toSummary(
  row: SummaryRow,
  seesCustomer: boolean,
  reserved: ReadonlyMap<string, Prisma.Decimal>,
) {
  return {
    id: row.id,
    number: row.number,
    subtype: row.subtype,
    status: row.status,
    department: { id: row.departmentId, name: row.departmentName },
    ...customerRef(seesCustomer, row),
    jobNumber: row.jobNumber,
    lineCount: row.lines.length,
    waitingLines: row.lines.filter((l) =>
      lineWaiting(row.status, l, reserved).gt(0),
    ).length,
    createdAt: row.createdAt.toISOString(),
  };
}

function forbidden(): never {
  throw new ForbiddenException({
    code: 'PERMISSION_DENIED',
    message: "You don't have access to this.",
  });
}

@Injectable()
export class MrnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
    private readonly stock: StockPostingService,
    private readonly store: MainStore,
    @Inject(MRN_RELEASE_GATES) private readonly gates: MrnReleaseGate[],
  ) {}

  async list(policy: Policy, query: MrnQuery): Promise<MrnPage> {
    const seesCustomer = seesMrnCustomer(policy);
    const like = query.q
      ? { contains: query.q, mode: 'insensitive' as const }
      : null;
    let status: Prisma.MrnWhereInput = {};
    if (query.status === 'OPEN') status = { status: { in: OPEN_MRN_STATUSES } };
    else if (query.status === 'WAITING')
      status = { id: { in: await waitingMrnIds(this.prisma) } };
    else if (query.status !== 'ALL') status = { status: query.status };
    const rows = await this.prisma.mrn.findMany({
      where: {
        AND: [
          mrnScope(policy),
          status,
          like
            ? {
                OR: [
                  { number: like },
                  { jobNumber: like },
                  { departmentName: like },
                  ...(seesCustomer ? [{ customerName: like }] : []),
                ],
              }
            : {},
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
    const reserved = await reservationsOf(
      this.prisma,
      page.rows.flatMap((r) => r.lines.map((l) => l.id)),
    );
    return {
      items: page.rows.map((r) => toSummary(r, seesCustomer, reserved)),
      nextCursor: page.nextCursor,
    };
  }

  async detail(policy: Policy, id: string, scoped = true): Promise<MrnDto> {
    const row = await this.prisma.mrn.findFirst({
      where: { id, ...(scoped ? mrnScope(policy) : {}) },
      select: DETAIL_SELECT,
    });
    if (!row) notFound('Request not found.');
    return this.toDetail(policy, row);
  }

  private async toDetail(policy: Policy, row: DetailRow): Promise<MrnDto> {
    const storeId = await this.store.id();
    const itemIds = [...new Set(row.lines.map((l) => l.itemId))];
    const [reserved, names, hold, balances, binStock] = await Promise.all([
      reservationsOf(
        this.prisma,
        row.lines.map((l) => l.id),
      ),
      userNames(this.prisma, [row.submittedBy, row.checkedBy, row.closedBy]),
      row.holdId
        ? this.prisma.hold.findUnique({
            where: { id: row.holdId },
            select: { id: true, number: true },
          })
        : null,
      this.prisma.stockBalance.findMany({
        where: { storeId, itemId: { in: itemIds } },
        select: {
          itemId: true,
          onHand: true,
          held: true,
          quarantine: true,
          receiving: true,
        },
      }),
      this.prisma.binStock.findMany({
        where: {
          itemId: { in: itemIds },
          qty: { gt: 0 },
          bin: { kind: 'STORAGE', active: true, storeId },
        },
        select: {
          itemId: true,
          qty: true,
          bin: { select: { id: true, code: true } },
        },
        orderBy: { bin: { code: 'asc' } },
      }),
    ]);
    const free = new Map(
      balances.map((b) => [b.itemId, stockFigures(b).figures.free]),
    );
    return {
      ...toSummary(row, seesMrnCustomer(policy), reserved),
      customerPo: row.customerPo,
      quotationRef: row.quotationRef,
      notes: row.notes,
      hold,
      submitted: stampOf(row.submittedBy, row.submittedAt, names),
      checked: stampOf(row.checkedBy, row.checkedAt, names),
      closed: stampOf(row.closedBy, row.closedAt, names),
      closeReason: row.closeReason,
      version: row.version,
      lines: row.lines.map((l) => ({
        id: l.id,
        lineNo: l.lineNo,
        item: toItemRef(l.item),
        qtyRequested: qtyString(l.qtyRequested),
        qtyReserved: qtyString(reserved.get(l.id) ?? 0),
        qtyIssued: qtyString(l.qtyIssued),
        qtyShortClosed: qtyString(l.qtyShortClosed),
        qtyWaiting: qtyString(lineWaiting(row.status, l, reserved)),
        freeNow: free.get(l.itemId) ?? '0',
        notes: l.notes,
        bins: binStock
          .filter((b) => b.itemId === l.itemId)
          .map((b) => ({
            id: b.bin.id,
            code: b.bin.code,
            qty: qtyString(b.qty),
          })),
      })),
      aods: row.aods,
    };
  }

  async summary(policy: Policy): Promise<IssuingSummary> {
    const scope = mrnScope(policy);
    const aods = can(policy, 'inventory.aod.view') ? aodScope(policy) : null;
    const waiting = await waitingMrnIds(this.prisma);
    const count = (status: MrnStatus) =>
      this.prisma.mrn.count({ where: { AND: [scope, { status }] } });
    const [
      mrnDrafts,
      mrnToCheck,
      mrnWaiting,
      mrnReady,
      picking,
      awaitingSignature,
      activeHolds,
    ] = await Promise.all([
      count('DRAFT'),
      count('SUBMITTED'),
      this.prisma.mrn.count({
        where: { AND: [scope, { id: { in: waiting } }] },
      }),
      count('READY'),
      aods
        ? this.prisma.aod.count({
            where: { AND: [aods, { status: 'PICKING' }] },
          })
        : 0,
      aods
        ? this.prisma.aod.count({
            where: { AND: [aods, { status: 'ISSUED' }] },
          })
        : 0,
      can(policy, 'inventory.hold.view')
        ? this.prisma.hold.count({
            where: { AND: [holdScope(policy), { status: 'ACTIVE' }] },
          })
        : 0,
    ]);
    return {
      mrnDrafts,
      mrnToCheck,
      mrnWaiting,
      mrnReady,
      picking,
      awaitingSignature,
      activeHolds,
    };
  }

  async create(policy: Policy, input: MrnInput): Promise<MrnDto> {
    const department = await activeDepartment(this.prisma, input.departmentId);
    const customer = await activeCustomer(this.prisma, input.customerId);
    const plan = await this.planLines([], input.lines);
    const id = await this.prisma.$transaction(async (tx) => {
      const created = await tx.mrn.create({
        data: {
          subtype: input.subtype,
          departmentId: department.id,
          departmentName: department.name,
          customerId: customer?.id ?? null,
          customerName: customer?.name ?? null,
          jobNumber: input.jobNumber ?? null,
          customerPo: input.customerPo ?? null,
          quotationRef: input.quotationRef ?? null,
          notes: input.notes ?? null,
          createdBy: policy.userId,
          updatedBy: policy.userId,
          lines: {
            create: plan.map((p) => ({
              lineNo: p.lineNo,
              itemId: p.itemId,
              qtyRequested: p.qtyRequested,
              notes: p.notes,
            })),
          },
        },
        select: { id: true },
      });
      await this.audit.record(
        auditEntry(MRN_KEY, created.id, 'create', {
          subtype: input.subtype,
          departmentId: department.id,
          customerId: customer?.id ?? null,
          jobNumber: input.jobNumber ?? null,
          lines: plan.map(({ itemId, qtyRequested }) => ({
            itemId,
            qtyRequested,
          })),
        }),
        tx,
      );
      return created.id;
    });
    return this.detail(policy, id, false);
  }

  async update(policy: Policy, id: string, input: MrnUpdate): Promise<MrnDto> {
    const before = await this.prisma.mrn.findUnique({
      where: { id },
      select: {
        status: true,
        version: true,
        subtype: true,
        departmentId: true,
        customerId: true,
        jobNumber: true,
        customerPo: true,
        quotationRef: true,
        notes: true,
        lines: {
          select: { id: true, itemId: true, qtyRequested: true, notes: true },
          orderBy: { lineNo: 'asc' },
        },
      },
    });
    if (!before) notFound('Request not found.');
    this.guard('edit', before, input.version);
    const changes: Record<string, unknown> = {};
    if (input.subtype !== undefined) changes['subtype'] = input.subtype;
    for (const key of [
      'jobNumber',
      'customerPo',
      'quotationRef',
      'notes',
    ] as const) {
      if (input[key] !== undefined) changes[key] = input[key];
    }
    if (input.departmentId !== undefined) {
      const department = await activeDepartment(
        this.prisma,
        input.departmentId,
      );
      changes['departmentId'] = department.id;
      changes['departmentName'] = department.name;
    }
    if (input.customerId !== undefined) {
      const customer = await activeCustomer(this.prisma, input.customerId);
      changes['customerId'] = customer?.id ?? null;
      changes['customerName'] = customer?.name ?? null;
    }
    const plan = input.lines
      ? await this.planLines(before.lines, input.lines)
      : null;

    await this.prisma.$transaction(async (tx) => {
      await this.claim(tx, id, 'edit', input.version, policy.userId, changes);
      if (plan) await replaceLines(tx, id, before.lines, plan);
      const beforeValues: Record<string, unknown> = {};
      for (const key of Object.keys(changes)) {
        if (key in before)
          beforeValues[key] = before[key as keyof typeof before];
      }
      const afterValues: Record<string, unknown> = { ...changes };
      delete afterValues['departmentName'];
      delete afterValues['customerName'];
      if (plan) {
        beforeValues['lines'] = before.lines.map((l) => ({
          itemId: l.itemId,
          qtyRequested: qtyString(l.qtyRequested),
        }));
        afterValues['lines'] = plan.map(({ itemId, qtyRequested }) => ({
          itemId,
          qtyRequested,
        }));
      }
      await this.audit.record(
        auditEntry(MRN_KEY, id, 'update', afterValues, {
          before: beforeValues,
        }),
        tx,
      );
    });
    return this.detail(policy, id, false);
  }

  private async planLines(
    existing: readonly { id: string; itemId: string }[],
    inputs: MrnInput['lines'],
  ): Promise<LinePlan[]> {
    const current = new Map(existing.map((l) => [l.id, l]));
    const items = await loadItems(
      this.prisma,
      inputs.map((l) => l.itemId),
    );
    const seen = new Set<string>();
    return inputs.map((line, i) => {
      const prev = line.id ? current.get(line.id) : undefined;
      if (line.id && (!prev || seen.has(line.id))) {
        invalid('That line is not on this request.', [`lines.${i}.id`]);
      }
      if (prev) seen.add(prev.id);
      const item = requireItem(
        items,
        line.itemId,
        `lines.${i}.itemId`,
        prev?.itemId !== line.itemId,
      );
      checkQty(item, line.qty, `lines.${i}.qty`);
      return {
        id: prev?.id ?? null,
        lineNo: i + 1,
        itemId: line.itemId,
        qtyRequested: qtyString(line.qty),
        notes: line.notes ?? null,
      };
    });
  }

  async submit(policy: Policy, id: string, version: number): Promise<MrnDto> {
    const before = await this.prisma.mrn.findUnique({
      where: { id },
      select: { status: true, version: true, subtype: true },
    });
    if (!before) notFound('Request not found.');
    this.guard('submit', before, version);
    await this.prisma.$transaction(async (tx) => {
      await this.claim(tx, id, 'submit', version, policy.userId, {});
      const now = new Date();
      const { number } = await this.numbering.next(tx, {
        docType: 'MRN',
        subtype: before.subtype,
        date: now,
      });
      await tx.mrn.update({
        where: { id },
        data: {
          status: 'SUBMITTED',
          number,
          submittedBy: policy.userId,
          submittedAt: now,
        },
      });
      await this.audit.record(
        auditEntry(
          MRN_KEY,
          id,
          'submitted',
          { status: 'SUBMITTED', number },
          { before: { status: 'DRAFT' } },
        ),
        tx,
      );
    });
    return this.detail(policy, id, false);
  }

  async check(policy: Policy, id: string, version: number): Promise<MrnDto> {
    const before = await this.prisma.mrn.findUnique({
      where: { id },
      select: { status: true, version: true },
    });
    if (!before) notFound('Request not found.');
    this.guard('check', before, version);
    await this.prisma.$transaction(async (tx) => {
      await this.claim(tx, id, 'check', version, policy.userId, {
        checkedBy: policy.userId,
        checkedAt: new Date(),
      });
      const reserved = await this.reserveWaiting(tx, id, null);
      const status = await this.settle(
        tx,
        id,
        'SUBMITTED',
        reserved.anyWaiting,
      );
      await this.audit.record(
        auditEntry(
          MRN_KEY,
          id,
          'checked',
          { status, reserved: reserved.moves },
          { before: { status: 'SUBMITTED' } },
        ),
        tx,
      );
    });
    return this.detail(policy, id, false);
  }

  async allocate(
    policy: Policy,
    id: string,
    input: MrnAllocate,
  ): Promise<MrnDto> {
    const before = await this.prisma.mrn.findUnique({
      where: { id },
      select: { status: true, version: true },
    });
    if (!before) notFound('Request not found.');
    this.guard('allocate', before, input.version);
    const wanted = input.lines
      ? sumByLine(input.lines.map((l) => ({ lineId: l.mrnLineId, qty: l.qty })))
      : null;
    await this.prisma.$transaction(async (tx) => {
      await this.claim(tx, id, 'allocate', input.version, policy.userId, {});
      const reserved = await this.reserveWaiting(tx, id, wanted);
      const status = await this.settle(
        tx,
        id,
        before.status,
        reserved.anyWaiting,
      );
      await this.audit.record(
        auditEntry(
          MRN_KEY,
          id,
          'allocated',
          { status, reserved: reserved.moves },
          { before: { status: before.status } },
        ),
        tx,
      );
    });
    return this.detail(policy, id, false);
  }

  private async reserveWaiting(
    tx: TransactionClient,
    mrnId: string,
    wanted: ReadonlyMap<string, Prisma.Decimal> | null,
  ): Promise<{
    anyWaiting: boolean;
    moves: { itemId: string; qty: string }[];
  }> {
    const lines = await tx.mrnLine.findMany({
      where: { mrnId },
      select: { ...LINE_QTY_SELECT, item: { select: { partNo: true } } },
      orderBy: [{ itemId: 'asc' }, { lineNo: 'asc' }],
    });
    if (wanted) {
      for (const lineId of wanted.keys()) {
        if (!lines.some((l) => l.id === lineId)) {
          invalid('That line is not on this request.', ['lines']);
        }
      }
    }
    const reserved = await reservationsOf(
      tx,
      lines.map((l) => l.id),
    );
    const moves: { itemId: string; qty: string }[] = [];
    for (const line of lines) {
      const has = reserved.get(line.id) ?? dec(0);
      const asked = wanted?.get(line.id);
      if (wanted && !asked) continue;
      const free = await this.stock.lockFreeQty(tx, line.itemId);
      let qty = toReserve(line, has, free);
      if (asked) {
        const waiting = waitingQty(line, has);
        if (asked.gt(waiting)) {
          invalid(
            `Only ${qtyString(waiting)} of ${line.item.partNo} is waiting.`,
            ['lines'],
          );
        }
        if (asked.gt(free)) notEnoughFor(line.item.partNo, qtyString(free));
        qty = asked;
      }
      if (!qty.gt(0)) continue;
      await this.stock.reserve(tx, {
        source: 'MRN',
        sourceId: mrnId,
        sourceLineId: line.id,
        itemId: line.itemId,
        qty,
      });
      reserved.set(line.id, has.plus(qty));
      moves.push({ itemId: line.itemId, qty: qtyString(qty) });
    }
    return {
      anyWaiting: lines.some((l) =>
        waitingQty(l, reserved.get(l.id) ?? 0).gt(0),
      ),
      moves,
    };
  }

  private async settle(
    tx: TransactionClient,
    mrnId: string,
    current: MrnStatus,
    anyWaiting: boolean,
  ): Promise<MrnStatus> {
    let status: MrnStatus = current === 'PARTLY_ISSUED' ? current : 'CHECKED';
    if (current !== 'PARTLY_ISSUED' && !anyWaiting) {
      status = (await this.passesGates(tx, mrnId)) ? 'READY' : 'CHECKED';
    }
    if (status !== current) {
      await tx.mrn.update({ where: { id: mrnId }, data: { status } });
    }
    return status;
  }

  private async passesGates(
    tx: TransactionClient,
    mrnId: string,
  ): Promise<boolean> {
    if (this.gates.length === 0) return true;
    const mrn = await tx.mrn.findUniqueOrThrow({
      where: { id: mrnId },
      select: {
        id: true,
        number: true,
        subtype: true,
        departmentId: true,
        customerId: true,
      },
    });
    const failed = await failedGates(this.gates, tx, mrn);
    if (failed.length > 0) {
      await this.audit.record(
        auditEntry(MRN_KEY, mrnId, 'release_blocked', { gates: failed }),
        tx,
      );
    }
    return failed.length === 0;
  }

  async cancel(policy: Policy, id: string, version: number): Promise<MrnDto> {
    const before = await this.prisma.mrn.findUnique({
      where: { id },
      select: {
        status: true,
        version: true,
        lines: { select: { id: true, qtyIssued: true } },
      },
    });
    if (!before) notFound('Request not found.');
    this.guard('cancel', before, version);
    if (before.lines.some((l) => dec(l.qtyIssued).gt(0))) {
      conflict(
        'INVALID_STATE',
        'Stock has already been issued on this request.',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await this.claim(tx, id, 'cancel', version, policy.userId, {
        status: 'CANCELLED',
        closedBy: policy.userId,
        closedAt: new Date(),
      });
      const issued = await tx.aod.count({
        where: { mrnId: id, status: { in: ['ISSUED', 'SIGNED'] } },
      });
      if (issued > 0) {
        conflict(
          'INVALID_STATE',
          'Stock has already been issued on this request.',
        );
      }
      const aods = await this.cancelPicking(tx, id, policy.userId);
      const released = await this.releaseAll(tx, before.lines);
      await this.audit.record(
        auditEntry(
          MRN_KEY,
          id,
          'cancelled',
          { status: 'CANCELLED', released, aodsCancelled: aods },
          { before: { status: before.status } },
        ),
        tx,
      );
    });
    return this.detail(policy, id, false);
  }

  async shortClose(
    policy: Policy,
    id: string,
    input: { version: number; reason: string },
  ): Promise<MrnDto> {
    const before = await this.prisma.mrn.findUnique({
      where: { id },
      select: { status: true, version: true },
    });
    if (!before) notFound('Request not found.');
    this.guard('short_close', before, input.version);
    await this.prisma.$transaction(async (tx) => {
      await this.claim(tx, id, 'short_close', input.version, policy.userId, {
        status: 'SHORT_CLOSED',
        closedBy: policy.userId,
        closedAt: new Date(),
        closeReason: input.reason,
      });
      const aods = await this.cancelPicking(tx, id, policy.userId);
      const lines = await tx.mrnLine.findMany({
        where: { mrnId: id },
        select: LINE_QTY_SELECT,
      });
      const released = await this.releaseAll(tx, lines);
      const shortClosed: { itemId: string; qty: string }[] = [];
      for (const line of lines) {
        const left = outstandingQty(line);
        if (left.gt(0)) {
          await tx.mrnLine.update({
            where: { id: line.id },
            data: { qtyShortClosed: { increment: qtyString(left) } },
          });
          shortClosed.push({ itemId: line.itemId, qty: qtyString(left) });
        }
      }
      await this.audit.record(
        auditEntry(
          MRN_KEY,
          id,
          'short_closed',
          {
            status: 'SHORT_CLOSED',
            released,
            shortClosed,
            aodsCancelled: aods,
          },
          { before: { status: before.status }, reason: input.reason },
        ),
        tx,
      );
    });
    return this.detail(policy, id, false);
  }

  private async cancelPicking(
    tx: TransactionClient,
    mrnId: string,
    userId: string,
  ): Promise<number> {
    const picking = await tx.aod.findMany({
      where: { mrnId, status: 'PICKING' },
      select: { id: true },
    });
    if (picking.length === 0) return 0;
    await tx.aod.updateMany({
      where: { id: { in: picking.map((a) => a.id) }, status: 'PICKING' },
      data: {
        status: 'CANCELLED',
        version: { increment: 1 },
        updatedBy: userId,
      },
    });
    for (const aod of picking) {
      await this.audit.record(
        auditEntry(
          AOD_KEY,
          aod.id,
          'cancelled',
          { status: 'CANCELLED' },
          { before: { status: 'PICKING' }, reason: 'Request closed' },
        ),
        tx,
      );
    }
    return picking.length;
  }

  private async releaseAll(
    tx: TransactionClient,
    lines: readonly { id: string }[],
  ): Promise<string> {
    let total = dec(0);
    for (const line of lines) {
      total = total.plus(await this.stock.release(tx, 'MRN', line.id));
    }
    return qtyString(total);
  }

  async convertHold(
    policy: Policy,
    holdId: string,
    input: HoldConvert,
  ): Promise<MrnDto> {
    if (!can(policy, 'inventory.mrn.create')) forbidden();
    const hold = await this.prisma.hold.findUnique({
      where: { id: holdId },
      select: {
        status: true,
        version: true,
        number: true,
        departmentId: true,
        departmentName: true,
        customerId: true,
        customerName: true,
        lines: {
          select: { id: true, lineNo: true, itemId: true, qty: true },
          orderBy: { lineNo: 'asc' },
        },
      },
    });
    if (!hold) notFound('Hold not found.');
    assertHoldActive(hold.status);
    if (hold.version !== input.version) stale();

    const mrnId = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.hold.updateMany({
        where: { id: holdId, version: input.version, status: 'ACTIVE' },
        data: { version: { increment: 1 }, updatedBy: policy.userId },
      });
      if (claimed.count === 0) stale();
      const now = new Date();
      const { number } = await this.numbering.next(tx, {
        docType: 'MRN',
        subtype: input.subtype,
        date: now,
      });
      const mrn = await tx.mrn.create({
        data: {
          number,
          subtype: input.subtype,
          status: 'CHECKED',
          departmentId: hold.departmentId,
          departmentName: hold.departmentName,
          customerId: hold.customerId,
          customerName: hold.customerName,
          jobNumber: input.jobNumber ?? null,
          customerPo: input.customerPo ?? null,
          quotationRef: input.quotationRef ?? null,
          notes: input.notes ?? null,
          holdId,
          submittedBy: policy.userId,
          submittedAt: now,
          checkedBy: policy.userId,
          checkedAt: now,
          createdBy: policy.userId,
          updatedBy: policy.userId,
          lines: {
            create: hold.lines.map((l) => ({
              lineNo: l.lineNo,
              itemId: l.itemId,
              qtyRequested: l.qty,
            })),
          },
        },
        select: { id: true, lines: { select: { id: true, lineNo: true } } },
      });
      const mrnLineOf = new Map(mrn.lines.map((l) => [l.lineNo, l.id]));
      for (const line of hold.lines) {
        const mrnLineId = mrnLineOf.get(line.lineNo);
        if (!mrnLineId) throw new Error('Converted request is missing a line.');
        await this.stock.transfer(
          tx,
          { source: 'HOLD', sourceLineId: line.id },
          { source: 'MRN', sourceId: mrn.id, sourceLineId: mrnLineId },
        );
      }
      const status = await this.settle(tx, mrn.id, 'CHECKED', false);
      await tx.hold.update({
        where: { id: holdId },
        data: { status: 'CONVERTED', convertedMrnId: mrn.id },
      });
      await this.audit.record(
        auditEntry(
          HOLD_KEY,
          holdId,
          'converted',
          { status: 'CONVERTED', mrnId: mrn.id, mrnNumber: number },
          { before: { status: 'ACTIVE' } },
        ),
        tx,
      );
      await this.audit.record(
        auditEntry(MRN_KEY, mrn.id, 'create', {
          number,
          status,
          subtype: input.subtype,
          fromHold: hold.number,
          departmentId: hold.departmentId,
          customerId: hold.customerId,
          jobNumber: input.jobNumber ?? null,
        }),
        tx,
      );
      return mrn.id;
    });
    return this.detail(policy, mrnId, false);
  }

  async closeIfDone(
    tx: TransactionClient,
    mrnId: string,
    userId: string,
  ): Promise<boolean> {
    const mrn = await tx.mrn.findUniqueOrThrow({
      where: { id: mrnId },
      select: { status: true, aods: { select: { status: true } } },
    });
    if (!canClose(mrn.status, mrn.aods)) return false;
    await tx.mrn.update({
      where: { id: mrnId },
      data: {
        status: 'CLOSED',
        closedBy: userId,
        closedAt: new Date(),
        version: { increment: 1 },
        updatedBy: userId,
      },
    });
    await this.audit.record(
      auditEntry(
        MRN_KEY,
        mrnId,
        'closed',
        { status: 'CLOSED' },
        {
          before: { status: 'ISSUED' },
        },
      ),
      tx,
    );
    return true;
  }

  private guard(
    action: MrnAction,
    row: { status: MrnStatus; version: number },
    version: number,
  ): void {
    assertMrnAction(action, row.status);
    if (row.version !== version) stale();
  }

  private async claim(
    tx: TransactionClient,
    id: string,
    action: MrnAction,
    version: number,
    userId: string,
    data: Prisma.MrnUncheckedUpdateManyInput,
  ): Promise<void> {
    const claimed = await tx.mrn.updateMany({
      where: { id, version, status: { in: MRN_ALLOWED_FROM[action] } },
      data: { ...data, version: { increment: 1 }, updatedBy: userId },
    });
    if (claimed.count === 0) stale();
  }
}

interface LinePlan {
  id: string | null;
  lineNo: number;
  itemId: string;
  qtyRequested: string;
  notes: string | null;
}

function sumByLine(
  lines: readonly { lineId: string; qty: string }[],
): Map<string, Prisma.Decimal> {
  const totals = new Map<string, Prisma.Decimal>();
  for (const l of lines) {
    totals.set(l.lineId, (totals.get(l.lineId) ?? dec(0)).plus(dec(l.qty)));
  }
  return totals;
}

async function replaceLines(
  tx: TransactionClient,
  mrnId: string,
  existing: readonly { id: string }[],
  plan: readonly LinePlan[],
): Promise<void> {
  const kept = new Set(plan.flatMap((p) => (p.id ? [p.id] : [])));
  const dropped = existing.filter((l) => !kept.has(l.id)).map((l) => l.id);
  if (dropped.length > 0) {
    await tx.mrnLine.deleteMany({ where: { id: { in: dropped } } });
  }
  // Line numbers are unique per request, so park the kept ones out of the way first.
  await tx.$executeRaw`UPDATE inventory.mrn_line SET line_no = -line_no WHERE mrn_id = ${mrnId}::uuid`;
  const fresh: Prisma.MrnLineCreateManyInput[] = [];
  for (const p of plan) {
    const data = {
      lineNo: p.lineNo,
      itemId: p.itemId,
      qtyRequested: p.qtyRequested,
      notes: p.notes,
    };
    if (p.id) await tx.mrnLine.update({ where: { id: p.id }, data });
    else fresh.push({ ...data, mrnId });
  }
  if (fresh.length > 0) await tx.mrnLine.createMany({ data: fresh });
}
