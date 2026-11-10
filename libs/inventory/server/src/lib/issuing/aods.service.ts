import { pageMeta, pageWindow } from '@dax/contracts';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import type {
  AodCreate,
  AodDto,
  AodPage,
  AodQuery,
  AodUpdate,
} from '@dax/inventory-contract';
import {
  AttachmentAccessRegistry,
  AuditService,
  can,
  EventBus,
  NumberingService,
  type Policy,
} from '@dax/platform-core';
import {
  type Prisma,
  PrismaService,
  type TransactionClient,
} from '@dax/platform-db';
import { conflict, invalid, MODULE_KEY, notFound, stale } from '../common';
import { MainStore } from '../main-store.service';
import {
  auditEntry,
  type Db,
  ITEM_REF_SELECT,
  stampOf,
  toItemRef,
  userNames,
} from '../receiving/shared';
import { dec, qtyString } from '../stock-math';
import { stockIssued } from '../stock/events';
import { StockPostingService } from '../stock/stock-posting.service';
import { type AodPrint, renderAod } from './aod-pdf';
import { MrnsService, reservationsOf } from './mrns.service';
import {
  AOD_ALLOWED_FROM,
  type AodAction,
  type AodStatus,
  aodTypeLabel,
  assertAodAction,
  assertMrnAction,
  MRN_ALLOWED_FROM,
  OPEN_AOD_STATUSES,
  overReserved,
  statusAfterIssue,
  suggestBin,
} from './rules';
import {
  AOD_KEY,
  aodScope,
  customerRef,
  errorCode,
  lockMrn,
  MRN_KEY,
  seesMrnCustomer,
} from './shared';

const SUMMARY_SELECT = {
  id: true,
  number: true,
  type: true,
  status: true,
  createdAt: true,
  issuedAt: true,
  mrn: {
    select: {
      id: true,
      number: true,
      departmentId: true,
      departmentName: true,
      customerId: true,
      customerName: true,
      jobNumber: true,
    },
  },
  _count: { select: { lines: true } },
} as const;

const DETAIL_SELECT = {
  ...SUMMARY_SELECT,
  deliverTo: true,
  vehicleNo: true,
  notes: true,
  issuedBy: true,
  signedBy: true,
  signedAt: true,
  signedFile: true,
  version: true,
  lines: {
    select: {
      id: true,
      mrnLineId: true,
      qty: true,
      scanned: true,
      item: { select: ITEM_REF_SELECT },
      bin: { select: { id: true, code: true } },
    },
    orderBy: { id: 'asc' },
  },
} as const;

type SummaryRow = Prisma.AodGetPayload<{ select: typeof SUMMARY_SELECT }>;
type DetailRow = Prisma.AodGetPayload<{ select: typeof DETAIL_SELECT }>;

function toSummary(row: SummaryRow, seesCustomer: boolean) {
  return {
    id: row.id,
    number: row.number,
    type: row.type,
    status: row.status,
    mrn: { id: row.mrn.id, number: row.mrn.number },
    department: { id: row.mrn.departmentId, name: row.mrn.departmentName },
    ...customerRef(seesCustomer, row.mrn),
    lineCount: row._count.lines,
    createdAt: row.createdAt.toISOString(),
    issuedAt: row.issuedAt?.toISOString() ?? null,
  };
}

async function storageBins(db: Db, storeId: string, ids: readonly string[]) {
  const rows = await db.bin.findMany({
    where: { id: { in: [...new Set(ids)] } },
    select: { id: true, storeId: true, kind: true, active: true },
  });
  return new Set(
    rows
      .filter((b) => b.storeId === storeId && b.kind === 'STORAGE' && b.active)
      .map((b) => b.id),
  );
}

@Injectable()
export class AodsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
    private readonly events: EventBus,
    private readonly stock: StockPostingService,
    private readonly store: MainStore,
    private readonly mrns: MrnsService,
    private readonly attachments: AttachmentAccessRegistry,
  ) {}

  onModuleInit(): void {
    this.attachments.register(AOD_KEY, {
      moduleKey: MODULE_KEY,
      canView: async (policy, id, tx) =>
        can(policy, 'inventory.aod.view') &&
        (await (tx ?? this.prisma).aod.count({
          where: { id, ...aodScope(policy) },
        })) > 0,
      canAttach: async (policy, id) =>
        can(policy, 'inventory.aod.attach_signed') &&
        (await this.prisma.aod.count({ where: { id, status: 'ISSUED' } })) > 0,
    });
  }

  async list(policy: Policy, query: AodQuery): Promise<AodPage> {
    const seesCustomer = seesMrnCustomer(policy);
    const like = query.q
      ? { contains: query.q, mode: 'insensitive' as const }
      : null;
    const where: Prisma.AodWhereInput = {
      AND: [
        aodScope(policy),
        query.status === 'ALL'
          ? {}
          : query.status === 'OPEN'
            ? { status: { in: OPEN_AOD_STATUSES } }
            : { status: query.status },
        like
          ? {
              OR: [
                { number: like },
                { deliverTo: like },
                { mrn: { number: like } },
                { mrn: { jobNumber: like } },
              ],
            }
          : {},
      ],
    };
    const [rows, total] = await Promise.all([
      this.prisma.aod.findMany({
        where,
        select: SUMMARY_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...pageWindow(query),
      }),
      this.prisma.aod.count({ where }),
    ]);
    return {
      items: rows.map((r) => toSummary(r, seesCustomer)),
      ...pageMeta(query, total),
    };
  }

  async detail(policy: Policy, id: string, scoped = true): Promise<AodDto> {
    const row = await this.load(policy, id, scoped);
    const [names, reserved] = await Promise.all([
      userNames(this.prisma, [row.issuedBy, row.signedBy]),
      reservationsOf(
        this.prisma,
        row.lines.map((l) => l.mrnLineId),
      ),
    ]);
    return {
      ...toSummary(row, seesMrnCustomer(policy)),
      deliverTo: row.deliverTo,
      vehicleNo: row.vehicleNo,
      notes: row.notes,
      issued: stampOf(row.issuedBy, row.issuedAt, names),
      signed: stampOf(row.signedBy, row.signedAt, names),
      signedFileId: row.signedFile,
      version: row.version,
      lines: row.lines.map((l) => ({
        id: l.id,
        mrnLineId: l.mrnLineId,
        item: toItemRef(l.item),
        bin: l.bin,
        qty: qtyString(l.qty),
        reservedForLine: qtyString(reserved.get(l.mrnLineId) ?? 0),
        scanned: l.scanned,
      })),
    };
  }

  private async load(
    policy: Policy,
    id: string,
    scoped: boolean,
  ): Promise<DetailRow> {
    const row = await this.prisma.aod.findFirst({
      where: { id, ...(scoped ? aodScope(policy) : {}) },
      select: DETAIL_SELECT,
    });
    if (!row) notFound('AOD not found.');
    return row;
  }

  async pdf(
    policy: Policy,
    id: string,
  ): Promise<{ number: string | null; pdf: Buffer }> {
    const row = await this.load(policy, id, true);
    const names = await userNames(this.prisma, [row.issuedBy]);
    const print: AodPrint = {
      number: row.number,
      typeLabel: aodTypeLabel(row.type),
      date: row.issuedAt ?? new Date(),
      mrnNumber: row.mrn.number,
      department: row.mrn.departmentName,
      customer: seesMrnCustomer(policy) ? (row.mrn.customerName ?? '-') : null,
      jobNumber: row.mrn.jobNumber,
      deliverTo: row.deliverTo,
      vehicleNo: row.vehicleNo,
      notes: row.notes,
      issuedBy: row.issuedBy ? (names.get(row.issuedBy) ?? null) : null,
      lines: row.lines.map((l) => ({
        partNo: l.item.partNo,
        description: l.item.description,
        bin: l.bin?.code ?? null,
        qty: qtyString(l.qty),
        uom: l.item.uom,
      })),
    };
    const pdf = await renderAod(print);
    await this.audit.record(
      auditEntry(AOD_KEY, id, 'printed', { number: row.number }),
    );
    return { number: row.number, pdf };
  }

  async create(policy: Policy, input: AodCreate): Promise<AodDto> {
    const mrn = await this.prisma.mrn.findUnique({
      where: { id: input.mrnId },
      select: { status: true },
    });
    if (!mrn) notFound('Request not found.');
    assertMrnAction('pick', mrn.status);
    const storeId = await this.store.id();

    const id = await this.prisma.$transaction(async (tx) => {
      const status = await lockMrn(tx, input.mrnId);
      if (!status) notFound('Request not found.');
      assertMrnAction('pick', status);
      const picking = await tx.aod.count({
        where: { mrnId: input.mrnId, status: 'PICKING' },
      });
      if (picking > 0) {
        conflict(
          'AOD_IN_PROGRESS',
          'This request already has an AOD being picked. Issue or cancel it first.',
        );
      }
      const lines = await tx.mrnLine.findMany({
        where: { mrnId: input.mrnId },
        select: {
          id: true,
          itemId: true,
          item: { select: { defaultBinId: true } },
        },
        orderBy: { lineNo: 'asc' },
      });
      const reserved = await reservationsOf(
        tx,
        lines.map((l) => l.id),
      );
      const toPick = lines.filter((l) => (reserved.get(l.id) ?? dec(0)).gt(0));
      if (toPick.length === 0) {
        conflict(
          'NOTHING_RESERVED',
          'Nothing is reserved on this request yet.',
        );
      }
      const stock = await tx.binStock.findMany({
        where: {
          itemId: { in: toPick.map((l) => l.itemId) },
          qty: { gt: 0 },
          bin: { storeId, kind: 'STORAGE', active: true },
        },
        select: { itemId: true, binId: true, qty: true },
      });
      const created = await tx.aod.create({
        data: {
          mrnId: input.mrnId,
          type: input.type,
          deliverTo: input.deliverTo ?? null,
          vehicleNo: input.vehicleNo ?? null,
          notes: input.notes ?? null,
          createdBy: policy.userId,
          updatedBy: policy.userId,
          lines: {
            create: toPick.map((l) => {
              const qty = reserved.get(l.id) ?? dec(0);
              return {
                mrnLineId: l.id,
                itemId: l.itemId,
                qty: qtyString(qty),
                binId: suggestBin(
                  l.item.defaultBinId,
                  stock.filter((s) => s.itemId === l.itemId),
                  qty,
                ),
              };
            }),
          },
        },
        select: { id: true },
      });
      await this.audit.record(
        auditEntry(AOD_KEY, created.id, 'create', {
          mrnId: input.mrnId,
          type: input.type,
          lines: toPick.length,
        }),
        tx,
      );
      return created.id;
    });
    return this.detail(policy, id, false);
  }

  async update(policy: Policy, id: string, input: AodUpdate): Promise<AodDto> {
    const before = await this.prisma.aod.findUnique({
      where: { id },
      select: {
        status: true,
        version: true,
        mrnId: true,
        type: true,
        deliverTo: true,
        vehicleNo: true,
        notes: true,
        lines: {
          select: {
            id: true,
            mrnLineId: true,
            binId: true,
            qty: true,
            scanned: true,
          },
        },
      },
    });
    if (!before) notFound('AOD not found.');
    this.guard('edit', before, input.version);
    const changes: Record<string, unknown> = {};
    for (const key of ['type', 'deliverTo', 'vehicleNo', 'notes'] as const) {
      if (input[key] !== undefined) changes[key] = input[key];
    }
    const plan = input.lines
      ? await this.planLines(before.mrnId, before.lines, input.lines)
      : null;

    await this.prisma.$transaction(async (tx) => {
      await this.claim(tx, id, 'edit', input.version, policy.userId, changes);
      if (plan) {
        const kept = new Set(plan.flatMap((p) => (p.id ? [p.id] : [])));
        const dropped = before.lines
          .filter((l) => !kept.has(l.id))
          .map((l) => l.id);
        if (dropped.length > 0) {
          await tx.aodLine.deleteMany({ where: { id: { in: dropped } } });
        }
        const fresh: Prisma.AodLineCreateManyInput[] = [];
        for (const p of plan) {
          const data = {
            mrnLineId: p.mrnLineId,
            itemId: p.itemId,
            binId: p.binId,
            qty: p.qty,
            scanned: p.scanned,
          };
          if (p.id) await tx.aodLine.update({ where: { id: p.id }, data });
          else fresh.push({ ...data, aodId: id });
        }
        if (fresh.length > 0) await tx.aodLine.createMany({ data: fresh });
      }
      const beforeValues: Record<string, unknown> = {};
      for (const key of Object.keys(changes)) {
        beforeValues[key] = before[key as keyof typeof before];
      }
      const afterValues: Record<string, unknown> = { ...changes };
      if (plan) {
        beforeValues['lines'] = before.lines.map((l) => ({
          mrnLineId: l.mrnLineId,
          binId: l.binId,
          qty: qtyString(l.qty),
          scanned: l.scanned,
        }));
        afterValues['lines'] = plan.map(
          ({ mrnLineId, binId, qty, scanned }) => ({
            mrnLineId,
            binId,
            qty,
            scanned,
          }),
        );
      }
      await this.audit.record(
        auditEntry(AOD_KEY, id, 'update', afterValues, {
          before: beforeValues,
        }),
        tx,
      );
    });
    return this.detail(policy, id, false);
  }

  private async planLines(
    mrnId: string,
    existing: readonly { id: string }[],
    inputs: NonNullable<AodUpdate['lines']>,
  ) {
    const storeId = await this.store.id();
    const mrnLines = new Map(
      (
        await this.prisma.mrnLine.findMany({
          where: { mrnId },
          select: {
            id: true,
            itemId: true,
            item: { select: { partNo: true, allowFraction: true } },
          },
        })
      ).map((l) => [l.id, l]),
    );
    const current = new Set(existing.map((l) => l.id));
    const binIds = inputs.flatMap((l) => (l.binId ? [l.binId] : []));
    const okBins = await storageBins(this.prisma, storeId, binIds);
    const seen = new Set<string>();
    const plan = inputs.map((line, i) => {
      const field = (name: string) => `lines.${i}.${name}`;
      if (line.id && (!current.has(line.id) || seen.has(line.id))) {
        invalid('That line is not on this AOD.', [field('id')]);
      }
      if (line.id) seen.add(line.id);
      const mrnLine = mrnLines.get(line.mrnLineId);
      if (!mrnLine)
        invalid('That line is not on the request.', [field('mrnLineId')]);
      if (line.binId && !okBins.has(line.binId)) {
        invalid('Pick from an active storage bin.', [field('binId')]);
      }
      if (!mrnLine.item.allowFraction && !dec(line.qty).isInteger()) {
        invalid(`${mrnLine.item.partNo} is counted in whole units.`, [
          field('qty'),
        ]);
      }
      return {
        id: line.id ?? null,
        mrnLineId: line.mrnLineId,
        itemId: mrnLine.itemId,
        partNo: mrnLine.item.partNo,
        binId: line.binId,
        qty: qtyString(line.qty),
        scanned: line.scanned,
      };
    });
    const reserved = await reservationsOf(this.prisma, [...mrnLines.keys()]);
    const over = overReserved(plan, reserved);
    if (over) {
      const partNo = mrnLines.get(over)?.item.partNo ?? 'this item';
      conflict(
        'MORE_THAN_RESERVED',
        `Only ${qtyString(reserved.get(over) ?? 0)} of ${partNo} is reserved for this request.`,
      );
    }
    return plan;
  }

  async issue(policy: Policy, id: string, version: number): Promise<AodDto> {
    const before = await this.prisma.aod.findUnique({
      where: { id },
      select: { status: true, version: true, mrnId: true, type: true },
    });
    if (!before) notFound('AOD not found.');
    this.guard('issue', before, version);
    const storeId = await this.store.id();

    await this.prisma.$transaction(async (tx) => {
      const mrnClaim = await tx.mrn.updateMany({
        where: { id: before.mrnId, status: { in: MRN_ALLOWED_FROM.issue } },
        data: { version: { increment: 1 }, updatedBy: policy.userId },
      });
      if (mrnClaim.count === 0) {
        conflict(
          'INVALID_STATE',
          'This request is no longer open for issuing.',
        );
      }
      await this.claim(tx, id, 'issue', version, policy.userId, {});
      const lines = await tx.aodLine.findMany({
        where: { aodId: id },
        select: {
          id: true,
          mrnLineId: true,
          itemId: true,
          binId: true,
          qty: true,
          item: { select: { partNo: true } },
        },
      });
      if (lines.length === 0)
        invalid('Add at least one line before issuing.', ['lines']);
      const okBins = await storageBins(
        tx,
        storeId,
        lines.flatMap((l) => (l.binId ? [l.binId] : [])),
      );
      const picks = lines.map((l) => {
        if (!l.binId || !okBins.has(l.binId)) {
          invalid(`Choose an active storage bin for ${l.item.partNo}.`, [
            'lines',
          ]);
        }
        return { ...l, binId: l.binId };
      });

      const now = new Date();
      const { number } = await this.numbering.next(tx, {
        docType: 'AOD',
        subtype: before.type,
        date: now,
      });
      await tx.aod.update({
        where: { id },
        data: {
          status: 'ISSUED',
          number,
          issuedBy: policy.userId,
          issuedAt: now,
        },
      });
      const ordered = [...picks].sort((a, b) =>
        a.itemId === b.itemId
          ? a.binId.localeCompare(b.binId)
          : a.itemId.localeCompare(b.itemId),
      );
      for (const pick of ordered) {
        try {
          await this.stock.issueReserved(
            tx,
            {
              itemId: pick.itemId,
              binId: pick.binId,
              qty: pick.qty,
              mrnLineId: pick.mrnLineId,
              docType: 'AOD',
              docId: id,
              docLineId: pick.id,
              docNumber: number,
            },
            policy.userId,
          );
        } catch (error) {
          if (errorCode(error) === 'NOT_RESERVED') {
            conflict(
              'NOT_RESERVED',
              `More of ${pick.item.partNo} is being issued than is reserved for this request.`,
            );
          }
          throw error;
        }
      }
      const issued = new Map<string, Prisma.Decimal>();
      for (const p of picks) {
        issued.set(
          p.mrnLineId,
          (issued.get(p.mrnLineId) ?? dec(0)).plus(dec(p.qty)),
        );
      }
      for (const [mrnLineId, qty] of issued) {
        await tx.mrnLine.update({
          where: { id: mrnLineId },
          data: { qtyIssued: { increment: qtyString(qty) } },
        });
      }
      const mrnLines = await tx.mrnLine.findMany({
        where: { mrnId: before.mrnId },
        select: { qtyRequested: true, qtyIssued: true, qtyShortClosed: true },
      });
      const mrnStatus = statusAfterIssue(mrnLines);
      await tx.mrn.update({
        where: { id: before.mrnId },
        data: { status: mrnStatus },
      });

      await this.events.publish(tx, stockIssued, {
        aodId: id,
        number,
        mrnId: before.mrnId,
        lines: picks.map((p) => ({
          itemId: p.itemId,
          binId: p.binId,
          qty: qtyString(p.qty),
        })),
      });
      await this.audit.record(
        auditEntry(
          AOD_KEY,
          id,
          'issued',
          {
            status: 'ISSUED',
            number,
            lines: picks.map((p) => ({
              itemId: p.itemId,
              binId: p.binId,
              qty: qtyString(p.qty),
            })),
          },
          { before: { status: 'PICKING' } },
        ),
        tx,
      );
      await this.audit.record(
        auditEntry(MRN_KEY, before.mrnId, 'issued', {
          status: mrnStatus,
          aod: number,
        }),
        tx,
      );
    });
    return this.detail(policy, id, false);
  }

  async cancel(policy: Policy, id: string, version: number): Promise<AodDto> {
    const before = await this.prisma.aod.findUnique({
      where: { id },
      select: { status: true, version: true },
    });
    if (!before) notFound('AOD not found.');
    this.guard('cancel', before, version);
    await this.prisma.$transaction(async (tx) => {
      await this.claim(tx, id, 'cancel', version, policy.userId, {
        status: 'CANCELLED',
      });
      await this.audit.record(
        auditEntry(
          AOD_KEY,
          id,
          'cancelled',
          { status: 'CANCELLED' },
          { before: { status: 'PICKING' } },
        ),
        tx,
      );
    });
    return this.detail(policy, id, false);
  }

  async sign(
    policy: Policy,
    id: string,
    input: { version: number; attachmentId: string },
  ): Promise<AodDto> {
    const before = await this.prisma.aod.findUnique({
      where: { id },
      select: { status: true, version: true, mrnId: true },
    });
    if (!before) notFound('AOD not found.');
    this.guard('sign', before, input.version);
    const file = await this.prisma.attachment.findFirst({
      where: {
        id: input.attachmentId,
        entityKey: AOD_KEY,
        entityId: id,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!file)
      invalid('Upload the signed copy to this AOD first.', ['attachmentId']);

    await this.prisma.$transaction(async (tx) => {
      await lockMrn(tx, before.mrnId);
      await this.claim(tx, id, 'sign', input.version, policy.userId, {
        status: 'SIGNED',
        signedFile: file.id,
        signedBy: policy.userId,
        signedAt: new Date(),
      });
      const closed = await this.mrns.closeIfDone(
        tx,
        before.mrnId,
        policy.userId,
      );
      await this.audit.record(
        auditEntry(
          AOD_KEY,
          id,
          'signed',
          { status: 'SIGNED', signedFile: file.id, mrnClosed: closed },
          { before: { status: 'ISSUED' } },
        ),
        tx,
      );
    });
    return this.detail(policy, id, false);
  }

  private guard(
    action: AodAction,
    row: { status: AodStatus; version: number },
    version: number,
  ): void {
    assertAodAction(action, row.status);
    if (row.version !== version) stale();
  }

  private async claim(
    tx: TransactionClient,
    id: string,
    action: AodAction,
    version: number,
    userId: string,
    data: Prisma.AodUncheckedUpdateManyInput,
  ): Promise<void> {
    const claimed = await tx.aod.updateMany({
      where: { id, version, status: { in: AOD_ALLOWED_FROM[action] } },
      data: { ...data, version: { increment: 1 }, updatedBy: userId },
    });
    if (claimed.count === 0) stale();
  }
}
