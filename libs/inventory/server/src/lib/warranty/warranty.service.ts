import { Injectable, type OnModuleInit } from '@nestjs/common';
import type {
  WarrantyClose,
  WarrantyCounts,
  WarrantyDto,
  WarrantyPage,
  WarrantyQuery,
  WarrantySend,
  WarrantyStatus,
  WarrantyTagInput,
  WarrantyTagUpdate,
} from '@dax/inventory-contract';
import {
  AttachmentAccessRegistry,
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
  canRead,
  encodeCursor,
  invalid,
  MODULE_KEY,
  notFound,
  pageFrom,
  stale,
} from '../common';
import { warrantyTagEntity } from '../entities';
import { activeCustomer, customerRef } from '../issuing/shared';
import { MainStore } from '../main-store.service';
import {
  activeSupplier,
  auditEntry,
  checkQty,
  createdBefore,
  type Db,
  ITEM_REF_SELECT,
  loadItems,
  specialBins,
  stampOf,
  toItemRef,
  userNames,
} from '../receiving/shared';
import { qtyString } from '../stock-math';
import {
  assertCanSend,
  assertOpen,
  assertSupplierKept,
  closeNoteFor,
} from './rules';

export const WARRANTY_KEY = 'inventory.warranty_tag';

export interface TagFromReturn {
  itemId: string;
  qty: Prisma.Decimal | string;
  serialNo: string | null;
  jobNumber: string | null;
  customer: { id: string; name: string } | null;
  fault: string;
  returnLineId: string;
}

const OPEN: WarrantyStatus[] = ['TAGGED', 'SENT'];

const SUMMARY_SELECT = {
  id: true,
  number: true,
  status: true,
  qty: true,
  serialNo: true,
  jobNumber: true,
  customerId: true,
  customerName: true,
  supplierId: true,
  supplierName: true,
  claimNumber: true,
  outcome: true,
  createdAt: true,
  item: { select: ITEM_REF_SELECT },
} as const;

const DETAIL_SELECT = {
  ...SUMMARY_SELECT,
  machineModel: { select: { id: true, name: true } },
  machineSerial: true,
  fault: true,
  bin: { select: { id: true, code: true } },
  returnLineId: true,
  createdBy: true,
  sentBy: true,
  sentAt: true,
  closedBy: true,
  closedAt: true,
  closeNote: true,
  version: true,
} as const;

const EDIT_SELECT = {
  status: true,
  version: true,
  itemId: true,
  qty: true,
  serialNo: true,
  machineModelId: true,
  machineSerial: true,
  jobNumber: true,
  customerId: true,
  supplierId: true,
  claimNumber: true,
  fault: true,
  returnLineId: true,
} as const;

type SummaryRow = Prisma.WarrantyTagGetPayload<{
  select: typeof SUMMARY_SELECT;
}>;
type DetailRow = Prisma.WarrantyTagGetPayload<{ select: typeof DETAIL_SELECT }>;
type TagData = Omit<
  Prisma.WarrantyTagUncheckedCreateInput,
  'number' | 'binId' | 'createdBy' | 'updatedBy'
>;

function seesCustomer(policy: Policy): boolean {
  return canRead(policy, warrantyTagEntity, 'customerName');
}

function statusWhere(
  status: WarrantyQuery['status'],
): Prisma.WarrantyTagWhereInput {
  if (status === 'ALL') return {};
  if (status === 'OPEN') return { status: { in: OPEN } };
  return { status };
}

function search(
  q: string | undefined,
  withCustomer: boolean,
): Prisma.WarrantyTagWhereInput {
  if (!q) return {};
  const like = { contains: q, mode: 'insensitive' as const };
  return {
    OR: [
      { number: like },
      { serialNo: like },
      { machineSerial: like },
      { jobNumber: like },
      { claimNumber: like },
      { supplierName: like },
      { item: { partNo: like } },
      ...(withCustomer ? [{ customerName: like }] : []),
    ],
  };
}

function toSummary(row: SummaryRow, withCustomer: boolean) {
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    item: toItemRef(row.item),
    qty: qtyString(row.qty),
    serialNo: row.serialNo,
    jobNumber: row.jobNumber,
    ...customerRef(withCustomer, row),
    supplier:
      row.supplierId && row.supplierName
        ? { id: row.supplierId, name: row.supplierName }
        : null,
    claimNumber: row.claimNumber,
    outcome: row.outcome,
    createdAt: row.createdAt.toISOString(),
  };
}

async function activeMachineModel(db: Db, id: string): Promise<void> {
  const row = await db.machineModel.findUnique({
    where: { id },
    select: { active: true },
  });
  if (!row?.active) {
    invalid('Choose an active machine model.', ['machineModelId']);
  }
}

@Injectable()
export class WarrantyService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
    private readonly store: MainStore,
    private readonly attachments: AttachmentAccessRegistry,
  ) {}

  onModuleInit(): void {
    this.attachments.register(WARRANTY_KEY, {
      moduleKey: MODULE_KEY,
      canView: async (policy, id, tx) =>
        can(policy, 'inventory.warranty.view') &&
        (await this.statusOf(tx ?? this.prisma, id)) !== null,
      canAttach: async (policy, id) => {
        if (!can(policy, 'inventory.warranty.tag')) return false;
        const status = await this.statusOf(this.prisma, id);
        return status !== null && status !== 'CLOSED';
      },
    });
  }

  private async statusOf(db: Db, id: string): Promise<WarrantyStatus | null> {
    const row = await db.warrantyTag.findUnique({
      where: { id },
      select: { status: true },
    });
    return row?.status ?? null;
  }

  async list(policy: Policy, query: WarrantyQuery): Promise<WarrantyPage> {
    const withCustomer = seesCustomer(policy);
    const rows = await this.prisma.warrantyTag.findMany({
      where: {
        AND: [
          statusWhere(query.status),
          search(query.q, withCustomer),
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
    return {
      items: page.rows.map((r) => toSummary(r, withCustomer)),
      nextCursor: page.nextCursor,
    };
  }

  async counts(): Promise<WarrantyCounts> {
    const [tagged, sent] = await Promise.all([
      this.prisma.warrantyTag.count({ where: { status: 'TAGGED' } }),
      this.prisma.warrantyTag.count({ where: { status: 'SENT' } }),
    ]);
    return { tagged, sent };
  }

  async detail(policy: Policy, id: string): Promise<WarrantyDto> {
    const row = await this.prisma.warrantyTag.findUnique({
      where: { id },
      select: DETAIL_SELECT,
    });
    if (!row) notFound('Warranty tag not found.');
    return this.toDetail(policy, row);
  }

  private async toDetail(policy: Policy, row: DetailRow): Promise<WarrantyDto> {
    const [names, line] = await Promise.all([
      userNames(this.prisma, [row.createdBy, row.sentBy, row.closedBy]),
      row.returnLineId
        ? this.prisma.returnLine.findUnique({
            where: { id: row.returnLineId },
            select: { returnNote: { select: { id: true, number: true } } },
          })
        : null,
    ]);
    return {
      ...toSummary(row, seesCustomer(policy)),
      machineModel: row.machineModel,
      machineSerial: row.machineSerial,
      fault: row.fault,
      bin: row.bin,
      returnNote: line?.returnNote ?? null,
      created: stampOf(row.createdBy, row.createdAt, names),
      sent: stampOf(row.sentBy, row.sentAt, names),
      closed: stampOf(row.closedBy, row.closedAt, names),
      closeNote: row.closeNote,
      version: row.version,
    };
  }

  private async insert(
    tx: TransactionClient,
    actorId: string,
    data: TagData,
    audited: Record<string, unknown>,
  ): Promise<{ id: string; number: string }> {
    const { warranty } = await specialBins(tx, await this.store.id());
    const { number } = await this.numbering.next(tx, {
      docType: 'WTY',
      date: new Date(),
    });
    const tag = await tx.warrantyTag.create({
      data: {
        ...data,
        number,
        binId: warranty,
        createdBy: actorId,
        updatedBy: actorId,
      },
      select: { id: true },
    });
    await this.audit.record(
      auditEntry(WARRANTY_KEY, tag.id, 'create', { number, ...audited }),
      tx,
    );
    return { id: tag.id, number };
  }

  async tagFromReturn(
    tx: TransactionClient,
    actorId: string,
    input: TagFromReturn,
  ): Promise<{ id: string; number: string }> {
    return this.insert(
      tx,
      actorId,
      {
        itemId: input.itemId,
        qty: qtyString(input.qty),
        serialNo: input.serialNo,
        jobNumber: input.jobNumber,
        customerId: input.customer?.id ?? null,
        customerName: input.customer?.name ?? null,
        fault: input.fault,
        returnLineId: input.returnLineId,
      },
      { itemId: input.itemId, returnLineId: input.returnLineId },
    );
  }

  private async checkItem(
    itemId: string,
    qty: string,
    mustBeActive: boolean,
  ): Promise<void> {
    const item = (await loadItems(this.prisma, [itemId])).get(itemId);
    if (!item) invalid('Unknown item.', ['itemId']);
    if (mustBeActive && item.status !== 'ACTIVE') {
      invalid(`${item.partNo} is archived and can't be tagged.`, ['itemId']);
    }
    checkQty(item, qty, 'qty');
  }

  async create(policy: Policy, input: WarrantyTagInput): Promise<WarrantyDto> {
    await this.checkItem(input.itemId, input.qty, true);
    if (input.machineModelId) {
      await activeMachineModel(this.prisma, input.machineModelId);
    }
    const customer = await activeCustomer(this.prisma, input.customerId);
    const supplier = input.supplierId
      ? await activeSupplier(this.prisma, input.supplierId)
      : null;
    const fields = {
      itemId: input.itemId,
      qty: input.qty,
      serialNo: input.serialNo ?? null,
      machineModelId: input.machineModelId ?? null,
      machineSerial: input.machineSerial ?? null,
      jobNumber: input.jobNumber ?? null,
      customerId: customer?.id ?? null,
      supplierId: supplier?.id ?? null,
      claimNumber: input.claimNumber ?? null,
      fault: input.fault,
    };
    const { id } = await this.prisma.$transaction((tx) =>
      this.insert(
        tx,
        policy.userId,
        {
          ...fields,
          customerName: customer?.name ?? null,
          supplierName: supplier?.name ?? null,
        },
        fields,
      ),
    );
    return this.detail(policy, id);
  }

  private async editable(
    id: string,
    version: number,
    assertState: (status: WarrantyStatus) => void,
  ) {
    const row = await this.prisma.warrantyTag.findUnique({
      where: { id },
      select: EDIT_SELECT,
    });
    if (!row) notFound('Warranty tag not found.');
    assertState(row.status);
    if (row.version !== version) stale();
    return row;
  }

  async update(
    policy: Policy,
    id: string,
    input: WarrantyTagUpdate,
  ): Promise<WarrantyDto> {
    const before = await this.editable(id, input.version, assertOpen);
    assertSupplierKept(before.status, input.supplierId);

    const { version, ...fields } = input;
    const changed = Object.fromEntries(
      Object.entries(fields).filter(([key, value]) => {
        if (value === undefined) return false;
        const old = before[key as keyof typeof before];
        return key === 'qty'
          ? qtyString(old as Prisma.Decimal) !== qtyString(value as string)
          : old !== value;
      }),
    ) as Partial<typeof fields>;
    if (Object.keys(changed).length === 0) return this.detail(policy, id);

    if (changed.itemId && before.returnLineId) {
      invalid("The part on a tag from a return can't be changed.", ['itemId']);
    }
    if (changed.itemId !== undefined || changed.qty !== undefined) {
      await this.checkItem(
        changed.itemId ?? before.itemId,
        changed.qty ?? qtyString(before.qty),
        changed.itemId !== undefined,
      );
    }
    if (changed.machineModelId) {
      await activeMachineModel(this.prisma, changed.machineModelId);
    }
    const data: Prisma.WarrantyTagUncheckedUpdateManyInput = { ...changed };
    if (changed.customerId !== undefined) {
      const customer = await activeCustomer(this.prisma, changed.customerId);
      data.customerName = customer?.name ?? null;
    }
    if (changed.supplierId !== undefined) {
      const supplier = changed.supplierId
        ? await activeSupplier(this.prisma, changed.supplierId)
        : null;
      data.supplierName = supplier?.name ?? null;
    }
    const previous = Object.fromEntries(
      Object.keys(changed).map((key) => {
        const old = before[key as keyof typeof before];
        return [key, key === 'qty' ? qtyString(old as Prisma.Decimal) : old];
      }),
    );

    await this.prisma.$transaction(async (tx) => {
      const bumped = await tx.warrantyTag.updateMany({
        where: { id, version, status: { in: OPEN } },
        data: {
          ...data,
          version: { increment: 1 },
          updatedBy: policy.userId,
        },
      });
      if (bumped.count === 0) stale();
      await this.audit.record(
        auditEntry(WARRANTY_KEY, id, 'update', changed, { before: previous }),
        tx,
      );
    });
    return this.detail(policy, id);
  }

  async send(
    policy: Policy,
    id: string,
    input: WarrantySend,
  ): Promise<WarrantyDto> {
    const before = await this.editable(id, input.version, assertCanSend);
    const supplier = await activeSupplier(this.prisma, input.supplierId);
    const claimNumber =
      input.claimNumber === undefined ? before.claimNumber : input.claimNumber;
    await this.prisma.$transaction(async (tx) => {
      const bumped = await tx.warrantyTag.updateMany({
        where: { id, version: input.version, status: 'TAGGED' },
        data: {
          status: 'SENT',
          supplierId: supplier.id,
          supplierName: supplier.name,
          claimNumber,
          sentBy: policy.userId,
          sentAt: new Date(),
          version: { increment: 1 },
          updatedBy: policy.userId,
        },
      });
      if (bumped.count === 0) stale();
      await this.audit.record(
        auditEntry(
          WARRANTY_KEY,
          id,
          'sent',
          { status: 'SENT', supplierId: supplier.id, claimNumber },
          {
            before: {
              status: before.status,
              supplierId: before.supplierId,
              claimNumber: before.claimNumber,
            },
          },
        ),
        tx,
      );
    });
    return this.detail(policy, id);
  }

  async close(
    policy: Policy,
    id: string,
    input: WarrantyClose,
  ): Promise<WarrantyDto> {
    const before = await this.editable(id, input.version, assertOpen);
    const closeNote = closeNoteFor(input.outcome, input.note);
    await this.prisma.$transaction(async (tx) => {
      const bumped = await tx.warrantyTag.updateMany({
        where: { id, version: input.version, status: { in: OPEN } },
        data: {
          status: 'CLOSED',
          outcome: input.outcome,
          closeNote,
          closedBy: policy.userId,
          closedAt: new Date(),
          version: { increment: 1 },
          updatedBy: policy.userId,
        },
      });
      if (bumped.count === 0) stale();
      await this.audit.record(
        auditEntry(
          WARRANTY_KEY,
          id,
          'closed',
          { status: 'CLOSED', outcome: input.outcome, closeNote },
          { before: { status: before.status } },
        ),
        tx,
      );
    });
    return this.detail(policy, id);
  }
}
