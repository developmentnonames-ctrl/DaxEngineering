import { Injectable } from '@nestjs/common';
import type {
  ReturnableAod,
  ReturnAodOptions,
  ReturnAodQuery,
  ReturnDto,
  ReturnInput,
  ReturnLineInput,
  ReturnPage,
  ReturnQuery,
  ReturnsSummary,
  ReturnUpdate,
} from '@dax/inventory-contract';
import {
  AuditService,
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
  notFound,
  pageFrom,
  stale,
} from '../common';
import { returnNoteEntity } from '../entities';
import {
  activeCustomer,
  activeDepartment,
  customerRef,
} from '../issuing/shared';
import { MainStore } from '../main-store.service';
import {
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
import { type DecimalLike, qtyString } from '../stock-math';
import {
  type Movement,
  StockPostingService,
} from '../stock/stock-posting.service';
import { WarrantyService } from '../warranty/warranty.service';
import {
  assertReturnableAod,
  assertReturnAction,
  binFor,
  checkFault,
  checkFreeReason,
  isReturnableAod,
  movesStock,
  overReturned,
  overReturnFor,
  type ReturnCondition,
  returnableQty,
  RETURNABLE_AOD_STATUSES,
  sumByAodLine,
} from './rules';

export const RETURN_KEY = 'inventory.return_note';
export const RETURN_DOC_TYPE = 'RTN';

const SUMMARY_SELECT = {
  id: true,
  number: true,
  status: true,
  aod: { select: { id: true, number: true } },
  departmentId: true,
  departmentName: true,
  customerId: true,
  customerName: true,
  jobNumber: true,
  createdAt: true,
  postedAt: true,
  _count: { select: { lines: true } },
} as const;

const DETAIL_SELECT = {
  ...SUMMARY_SELECT,
  reason: true,
  notes: true,
  postedBy: true,
  version: true,
  lines: {
    select: {
      id: true,
      lineNo: true,
      aodLineId: true,
      qty: true,
      condition: true,
      serialNo: true,
      notes: true,
      warrantyTagId: true,
      item: { select: ITEM_REF_SELECT },
      bin: { select: { id: true, code: true } },
      aodLine: { select: { qty: true } },
    },
    orderBy: { lineNo: 'asc' },
  },
} as const;

type SummaryRow = Prisma.ReturnNoteGetPayload<{
  select: typeof SUMMARY_SELECT;
}>;

interface PlannedLine {
  aodLineId: string | null;
  itemId: string;
  qty: string;
  condition: ReturnCondition;
  binId: string | null;
  serialNo: string | null;
  notes: string | null;
}

interface AodLineInfo {
  itemId: string;
  qty: Prisma.Decimal;
  partNo: string;
}

export function seesReturnCustomer(policy: Policy): boolean {
  return canRead(policy, returnNoteEntity, 'customerName');
}

function toSummary(row: SummaryRow, seesCustomer: boolean) {
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    aod: row.aod,
    department: { id: row.departmentId, name: row.departmentName },
    ...customerRef(seesCustomer, row),
    jobNumber: row.jobNumber,
    lineCount: row._count.lines,
    createdAt: row.createdAt.toISOString(),
    postedAt: row.postedAt?.toISOString() ?? null,
  };
}

export async function returnedSoFar(
  db: Db,
  aodLineIds: readonly string[],
  excludeReturnId?: string,
): Promise<Map<string, Prisma.Decimal>> {
  if (aodLineIds.length === 0) return new Map();
  const rows = await db.returnLine.findMany({
    where: {
      aodLineId: { in: [...new Set(aodLineIds)] },
      returnNote: {
        status: 'POSTED',
        ...(excludeReturnId ? { id: { not: excludeReturnId } } : {}),
      },
    },
    select: { aodLineId: true, qty: true },
  });
  return sumByAodLine(rows);
}

async function aodLinesOf(
  db: Db,
  aodId: string,
): Promise<Map<string, AodLineInfo>> {
  const rows = await db.aodLine.findMany({
    where: { aodId },
    select: {
      id: true,
      itemId: true,
      qty: true,
      item: { select: { partNo: true } },
    },
  });
  return new Map(
    rows.map((r) => [
      r.id,
      { itemId: r.itemId, qty: r.qty, partNo: r.item.partNo },
    ]),
  );
}

async function checkReturnable(
  db: Db,
  lines: readonly { aodLineId: string | null; qty: DecimalLike }[],
  aodLines: ReadonlyMap<string, AodLineInfo>,
  excludeReturnId?: string,
): Promise<void> {
  const returned = await returnedSoFar(
    db,
    [...aodLines.keys()],
    excludeReturnId,
  );
  const left = new Map(
    [...aodLines].map(([id, l]) => [
      id,
      returnableQty(l.qty, returned.get(id) ?? 0),
    ]),
  );
  const over = overReturned(lines, left);
  if (over) {
    overReturnFor(
      aodLines.get(over)?.partNo ?? 'this part',
      left.get(over) ?? 0,
    );
  }
}

async function storageBins(
  db: Db,
  storeId: string,
  ids: readonly string[],
): Promise<Map<string, { code: string; countId: string | null }>> {
  if (ids.length === 0) return new Map();
  const rows = await db.bin.findMany({
    where: { id: { in: [...new Set(ids)] } },
    select: {
      id: true,
      code: true,
      storeId: true,
      kind: true,
      active: true,
      countId: true,
    },
  });
  return new Map(
    rows
      .filter((b) => b.storeId === storeId && b.kind === 'STORAGE' && b.active)
      .map((b) => [b.id, { code: b.code, countId: b.countId }]),
  );
}

async function lockAod(
  tx: TransactionClient,
  aodId: string,
): Promise<string | null> {
  const [row] = await tx.$queryRaw<{ status: string }[]>`
    SELECT status::text AS status FROM inventory.aod WHERE id = ${aodId}::uuid FOR UPDATE`;
  return row?.status ?? null;
}

function fromAodOnly(input: {
  departmentId?: string | null;
  customerId?: string | null;
  jobNumber?: string | null;
}): void {
  const fields = (['departmentId', 'customerId', 'jobNumber'] as const).filter(
    (f) => Boolean(input[f]),
  );
  if (fields.length > 0) {
    invalid(
      'The department, customer and job number come from the AOD.',
      fields,
    );
  }
}

@Injectable()
export class ReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
    private readonly stock: StockPostingService,
    private readonly store: MainStore,
    private readonly warranty: WarrantyService,
  ) {}

  async list(policy: Policy, query: ReturnQuery): Promise<ReturnPage> {
    const seesCustomer = seesReturnCustomer(policy);
    const like = query.q
      ? { contains: query.q, mode: 'insensitive' as const }
      : null;
    const rows = await this.prisma.returnNote.findMany({
      where: {
        AND: [
          query.status === 'ALL' ? {} : { status: query.status },
          like
            ? {
                OR: [
                  { number: like },
                  { jobNumber: like },
                  { departmentName: like },
                  { aod: { number: like } },
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
    return {
      items: page.rows.map((r) => toSummary(r, seesCustomer)),
      nextCursor: page.nextCursor,
    };
  }

  async summary(): Promise<ReturnsSummary> {
    const drafts = await this.prisma.returnNote.count({
      where: { status: 'DRAFT' },
    });
    return { drafts };
  }

  async detail(policy: Policy, id: string): Promise<ReturnDto> {
    const row = await this.prisma.returnNote.findUnique({
      where: { id },
      select: DETAIL_SELECT,
    });
    if (!row) notFound('Return not found.');
    const aodLineIds = row.lines.flatMap((l) =>
      l.aodLineId ? [l.aodLineId] : [],
    );
    const tagIds = row.lines.flatMap((l) =>
      l.warrantyTagId ? [l.warrantyTagId] : [],
    );
    const [names, returned, tags] = await Promise.all([
      userNames(this.prisma, [row.postedBy]),
      returnedSoFar(this.prisma, aodLineIds, id),
      tagIds.length > 0
        ? this.prisma.warrantyTag.findMany({
            where: { id: { in: tagIds } },
            select: { id: true, number: true },
          })
        : Promise.resolve([]),
    ]);
    const tagById = new Map(tags.map((t) => [t.id, t]));
    return {
      ...toSummary(row, seesReturnCustomer(policy)),
      reason: row.reason,
      notes: row.notes,
      posted: stampOf(row.postedBy, row.postedAt, names),
      version: row.version,
      lines: row.lines.map((l) => ({
        id: l.id,
        lineNo: l.lineNo,
        aodLineId: l.aodLineId,
        item: toItemRef(l.item),
        qty: qtyString(l.qty),
        condition: l.condition,
        bin: l.bin,
        serialNo: l.serialNo,
        notes: l.notes,
        warrantyTag: l.warrantyTagId
          ? (tagById.get(l.warrantyTagId) ?? null)
          : null,
        issued: l.aodLine ? qtyString(l.aodLine.qty) : null,
        returnedElsewhere: l.aodLineId
          ? qtyString(returned.get(l.aodLineId) ?? 0)
          : null,
      })),
    };
  }

  async returnable(policy: Policy, aodId: string): Promise<ReturnableAod> {
    const aod = await this.prisma.aod.findUnique({
      where: { id: aodId },
      select: {
        id: true,
        number: true,
        status: true,
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
        lines: {
          select: {
            id: true,
            qty: true,
            bin: { select: { id: true, code: true } },
            item: {
              select: {
                ...ITEM_REF_SELECT,
                defaultBin: { select: { id: true, code: true } },
              },
            },
          },
          orderBy: { id: 'asc' },
        },
      },
    });
    if (!aod) notFound('AOD not found.');
    const returned = await returnedSoFar(
      this.prisma,
      aod.lines.map((l) => l.id),
    );
    return {
      id: aod.id,
      number: aod.number,
      status: aod.status,
      open: isReturnableAod(aod.status),
      mrn: { id: aod.mrn.id, number: aod.mrn.number },
      department: { id: aod.mrn.departmentId, name: aod.mrn.departmentName },
      ...customerRef(seesReturnCustomer(policy), aod.mrn),
      jobNumber: aod.mrn.jobNumber,
      issuedAt: aod.issuedAt?.toISOString() ?? null,
      lines: aod.lines.map((l) => {
        const done = returned.get(l.id) ?? 0;
        return {
          aodLineId: l.id,
          item: toItemRef(l.item),
          pickedFrom: l.bin,
          defaultBin: l.item.defaultBin,
          issued: qtyString(l.qty),
          returned: qtyString(done),
          returnable: qtyString(returnableQty(l.qty, done)),
        };
      }),
    };
  }

  async aodOptions(
    policy: Policy,
    query: ReturnAodQuery,
  ): Promise<ReturnAodOptions> {
    const seesCustomer = seesReturnCustomer(policy);
    const like = query.q
      ? { contains: query.q, mode: 'insensitive' as const }
      : null;
    const rows = await this.prisma.aod.findMany({
      where: {
        status: { in: [...RETURNABLE_AOD_STATUSES] },
        ...(like
          ? {
              OR: [
                { number: like },
                { mrn: { number: like } },
                { mrn: { jobNumber: like } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        number: true,
        issuedAt: true,
        mrn: {
          select: { departmentName: true, customerName: true, jobNumber: true },
        },
      },
      orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }],
      take: 20,
    });
    return {
      items: rows.map((r) => ({
        id: r.id,
        number: r.number,
        department: r.mrn.departmentName,
        ...(seesCustomer ? { customer: r.mrn.customerName } : {}),
        jobNumber: r.mrn.jobNumber,
        issuedAt: r.issuedAt?.toISOString() ?? null,
      })),
    };
  }

  async create(policy: Policy, input: ReturnInput): Promise<ReturnDto> {
    const header = await this.headerFor(input);
    const lines = await this.planLines(header.aodId, input.lines);
    const id = await this.prisma.$transaction(async (tx) => {
      const note = await tx.returnNote.create({
        data: {
          ...header,
          notes: input.notes ?? null,
          createdBy: policy.userId,
          updatedBy: policy.userId,
          lines: {
            create: lines.map((l, i) => ({ ...l, lineNo: i + 1 })),
          },
        },
        select: { id: true },
      });
      await this.audit.record(
        auditEntry(RETURN_KEY, note.id, 'create', {
          aodId: header.aodId,
          departmentId: header.departmentId,
          customerId: header.customerId,
          jobNumber: header.jobNumber,
          reason: header.reason,
          lines,
        }),
        tx,
      );
      return note.id;
    });
    return this.detail(policy, id);
  }

  async update(
    policy: Policy,
    id: string,
    input: ReturnUpdate,
  ): Promise<ReturnDto> {
    const before = await this.prisma.returnNote.findUnique({
      where: { id },
      select: {
        status: true,
        version: true,
        aodId: true,
        departmentId: true,
        customerId: true,
        jobNumber: true,
        reason: true,
        notes: true,
        lines: {
          select: {
            aodLineId: true,
            itemId: true,
            qty: true,
            condition: true,
            binId: true,
            serialNo: true,
            notes: true,
          },
          orderBy: { lineNo: 'asc' },
        },
      },
    });
    if (!before) notFound('Return not found.');
    assertReturnAction('edit', before.status);
    if (before.version !== input.version) stale();

    const changes: Prisma.ReturnNoteUncheckedUpdateManyInput = {};
    if (before.aodId) {
      fromAodOnly(input);
    } else {
      if (input.departmentId !== undefined) {
        if (!input.departmentId) {
          invalid('Choose the department returning the parts.', [
            'departmentId',
          ]);
        }
        const department = await activeDepartment(
          this.prisma,
          input.departmentId,
        );
        changes.departmentId = department.id;
        changes.departmentName = department.name;
      }
      if (input.customerId !== undefined) {
        const customer = await activeCustomer(this.prisma, input.customerId);
        changes.customerId = customer?.id ?? null;
        changes.customerName = customer?.name ?? null;
      }
      if (input.jobNumber !== undefined) changes.jobNumber = input.jobNumber;
      checkFreeReason(
        input.reason !== undefined ? input.reason : before.reason,
      );
    }
    if (input.reason !== undefined) changes.reason = input.reason;
    if (input.notes !== undefined) changes.notes = input.notes;
    const lines = input.lines
      ? await this.planLines(before.aodId, input.lines)
      : null;

    await this.prisma.$transaction(async (tx) => {
      await this.claim(tx, id, input.version, policy.userId, changes);
      if (lines) {
        await tx.returnLine.deleteMany({ where: { returnId: id } });
        await tx.returnLine.createMany({
          data: lines.map((l, i) => ({ ...l, returnId: id, lineNo: i + 1 })),
        });
      }
      const beforeValues: Record<string, unknown> = {};
      const afterValues: Record<string, unknown> = {};
      for (const key of [
        'departmentId',
        'customerId',
        'jobNumber',
        'reason',
        'notes',
      ] as const) {
        if (changes[key] === undefined) continue;
        beforeValues[key] = before[key];
        afterValues[key] = changes[key];
      }
      if (lines) {
        beforeValues['lines'] = before.lines.map((l) => ({
          ...l,
          qty: qtyString(l.qty),
        }));
        afterValues['lines'] = lines;
      }
      await this.audit.record(
        auditEntry(RETURN_KEY, id, 'update', afterValues, {
          before: beforeValues,
        }),
        tx,
      );
    });
    return this.detail(policy, id);
  }

  async post(policy: Policy, id: string, version: number): Promise<ReturnDto> {
    const before = await this.prisma.returnNote.findUnique({
      where: { id },
      select: { status: true, version: true, aodId: true },
    });
    if (!before) notFound('Return not found.');
    assertReturnAction('post', before.status);
    if (before.version !== version) stale();
    const storeId = await this.store.id();

    await this.prisma.$transaction(async (tx) => {
      if (before.aodId) {
        const status = await lockAod(tx, before.aodId);
        if (!status) notFound('AOD not found.');
        assertReturnableAod(status);
      }
      await this.claim(tx, id, version, policy.userId, {});
      const note = await tx.returnNote.findUniqueOrThrow({
        where: { id },
        select: {
          customerId: true,
          customerName: true,
          jobNumber: true,
          lines: {
            select: {
              id: true,
              aodLineId: true,
              itemId: true,
              qty: true,
              condition: true,
              binId: true,
              serialNo: true,
              notes: true,
              item: { select: { partNo: true } },
            },
            orderBy: { lineNo: 'asc' },
          },
        },
      });
      if (note.lines.length === 0) {
        invalid('Add at least one line before posting.', ['lines']);
      }
      if (before.aodId) {
        await checkReturnable(
          tx,
          note.lines,
          await aodLinesOf(tx, before.aodId),
          id,
        );
      }
      const goodBins = await storageBins(
        tx,
        storeId,
        note.lines.flatMap((l) =>
          l.condition === 'GOOD' && l.binId ? [l.binId] : [],
        ),
      );
      for (const l of note.lines) {
        if (l.condition === 'GOOD' && (!l.binId || !goodBins.has(l.binId))) {
          invalid(`Choose an active storage bin for ${l.item.partNo}.`, [
            'lines',
          ]);
        }
      }

      const now = new Date();
      const { number } = await this.numbering.next(tx, {
        docType: RETURN_DOC_TYPE,
        date: now,
      });
      await tx.returnNote.update({
        where: { id },
        data: {
          status: 'POSTED',
          number,
          postedBy: policy.userId,
          postedAt: now,
        },
      });
      const movements: Movement[] = note.lines.flatMap((l) =>
        movesStock(l.condition) && l.binId
          ? [
              {
                itemId: l.itemId,
                binId: l.binId,
                qty: l.qty,
                movement: 'RETURN' as const,
                docType: RETURN_DOC_TYPE,
                docId: id,
                docLineId: l.id,
                docNumber: number,
              },
            ]
          : [],
      );
      await this.stock.post(tx, movements, policy.userId);

      const customer =
        note.customerId && note.customerName
          ? { id: note.customerId, name: note.customerName }
          : null;
      const tags: { lineId: string; number: string }[] = [];
      for (const l of note.lines) {
        if (l.condition !== 'FAULTY') continue;
        const tag = await this.warranty.tagFromReturn(tx, policy.userId, {
          itemId: l.itemId,
          qty: l.qty,
          serialNo: l.serialNo,
          jobNumber: note.jobNumber,
          customer,
          fault: l.notes ?? '',
          returnLineId: l.id,
        });
        await tx.returnLine.update({
          where: { id: l.id },
          data: { warrantyTagId: tag.id },
        });
        tags.push({ lineId: l.id, number: tag.number });
      }
      await this.audit.record(
        auditEntry(
          RETURN_KEY,
          id,
          'posted',
          {
            status: 'POSTED',
            number,
            lines: note.lines.map((l) => ({
              itemId: l.itemId,
              qty: qtyString(l.qty),
              condition: l.condition,
              binId: l.binId,
            })),
            warrantyTags: tags,
          },
          { before: { status: 'DRAFT' } },
        ),
        tx,
      );
    });
    return this.detail(policy, id);
  }

  async cancel(
    policy: Policy,
    id: string,
    version: number,
  ): Promise<ReturnDto> {
    const before = await this.prisma.returnNote.findUnique({
      where: { id },
      select: { status: true, version: true },
    });
    if (!before) notFound('Return not found.');
    assertReturnAction('cancel', before.status);
    if (before.version !== version) stale();
    await this.prisma.$transaction(async (tx) => {
      await this.claim(tx, id, version, policy.userId, {
        status: 'CANCELLED',
      });
      await this.audit.record(
        auditEntry(
          RETURN_KEY,
          id,
          'cancelled',
          { status: 'CANCELLED' },
          { before: { status: 'DRAFT' } },
        ),
        tx,
      );
    });
    return this.detail(policy, id);
  }

  private async headerFor(input: ReturnInput) {
    if (input.aodId) {
      fromAodOnly(input);
      const aod = await this.prisma.aod.findUnique({
        where: { id: input.aodId },
        select: {
          status: true,
          mrn: {
            select: {
              departmentId: true,
              departmentName: true,
              customerId: true,
              customerName: true,
              jobNumber: true,
            },
          },
        },
      });
      if (!aod) notFound('AOD not found.');
      assertReturnableAod(aod.status);
      return {
        aodId: input.aodId,
        departmentId: aod.mrn.departmentId,
        departmentName: aod.mrn.departmentName,
        customerId: aod.mrn.customerId,
        customerName: aod.mrn.customerName,
        jobNumber: aod.mrn.jobNumber,
        reason: input.reason ?? null,
      };
    }
    checkFreeReason(input.reason);
    if (!input.departmentId) {
      invalid('Choose the department returning the parts.', ['departmentId']);
    }
    const department = await activeDepartment(this.prisma, input.departmentId);
    const customer = await activeCustomer(this.prisma, input.customerId);
    return {
      aodId: null,
      departmentId: department.id,
      departmentName: department.name,
      customerId: customer?.id ?? null,
      customerName: customer?.name ?? null,
      jobNumber: input.jobNumber ?? null,
      reason: input.reason ?? null,
    };
  }

  private async planLines(
    aodId: string | null,
    inputs: readonly ReturnLineInput[],
  ): Promise<PlannedLine[]> {
    const storeId = await this.store.id();
    const [{ quarantine }, items, aodLines, goodBins] = await Promise.all([
      specialBins(this.prisma, storeId),
      loadItems(
        this.prisma,
        inputs.map((l) => l.itemId),
      ),
      aodId
        ? aodLinesOf(this.prisma, aodId)
        : Promise.resolve(new Map<string, AodLineInfo>()),
      storageBins(
        this.prisma,
        storeId,
        inputs.flatMap((l) =>
          l.condition === 'GOOD' && l.binId ? [l.binId] : [],
        ),
      ),
    ]);
    const plan = inputs.map((line, i): PlannedLine => {
      const field = (name: string) => `lines.${i}.${name}`;
      const item = items.get(line.itemId);
      if (!item) invalid('Unknown item.', [field('itemId')]);
      if (aodId) {
        const aodLine = line.aodLineId
          ? aodLines.get(line.aodLineId)
          : undefined;
        if (!aodLine) {
          invalid('That line is not on the AOD.', [field('aodLineId')]);
        }
        if (aodLine.itemId !== line.itemId) {
          invalid(`That AOD line is not for ${item.partNo}.`, [
            field('itemId'),
          ]);
        }
      } else {
        if (line.aodLineId) {
          invalid('Start the return from the AOD to return its lines.', [
            field('aodLineId'),
          ]);
        }
        if (item.status !== 'ACTIVE') {
          invalid(`${item.partNo} is archived.`, [field('itemId')]);
        }
      }
      checkQty(item, line.qty, field('qty'));
      checkFault(line.condition, line.notes, field('notes'));
      const binId = binFor(
        line.condition,
        line.binId,
        quarantine,
        field('binId'),
      );
      if (line.condition === 'GOOD' && binId) {
        const bin = goodBins.get(binId);
        if (!bin) invalid('Choose an active storage bin.', [field('binId')]);
        if (bin.countId) {
          invalid(
            `Bin ${bin.code} is being counted. Choose another bin or wait until the count is done.`,
            [field('binId')],
          );
        }
      }
      return {
        aodLineId: aodId ? (line.aodLineId ?? null) : null,
        itemId: line.itemId,
        qty: qtyString(line.qty),
        condition: line.condition,
        binId,
        serialNo: line.serialNo ?? null,
        notes: line.notes ?? null,
      };
    });
    if (aodId) await checkReturnable(this.prisma, plan, aodLines);
    return plan;
  }

  private async claim(
    tx: TransactionClient,
    id: string,
    version: number,
    userId: string,
    data: Prisma.ReturnNoteUncheckedUpdateManyInput,
  ): Promise<void> {
    const claimed = await tx.returnNote.updateMany({
      where: { id, version, status: 'DRAFT' },
      data: { ...data, version: { increment: 1 }, updatedBy: userId },
    });
    if (claimed.count === 0) stale();
  }
}
