import { pageMeta, pageWindow } from '@dax/contracts';
import { Injectable } from '@nestjs/common';
import type {
  HoldDto,
  HoldInput,
  HoldPage,
  HoldQuery,
} from '@dax/inventory-contract';
import {
  AuditService,
  NumberingService,
  type Policy,
} from '@dax/platform-core';
import { type Prisma, PrismaService } from '@dax/platform-db';
import { notFound, stale } from '../common';
import {
  auditEntry,
  checkQty,
  ITEM_REF_SELECT,
  loadItems,
  requireItem,
  stampOf,
  toItemRef,
  userNames,
} from '../receiving/shared';
import { dec, qtyString } from '../stock-math';
import { StockPostingService } from '../stock/stock-posting.service';
import { assertHoldActive } from './rules';
import {
  activeCustomer,
  activeDepartment,
  customerRef,
  errorCode,
  errorItemId,
  HOLD_KEY,
  holdScope,
  notEnoughFor,
  seesHoldCustomer,
} from './shared';

const SUMMARY_SELECT = {
  id: true,
  number: true,
  status: true,
  departmentId: true,
  departmentName: true,
  customerId: true,
  customerName: true,
  createdAt: true,
  _count: { select: { lines: true } },
} as const;

const DETAIL_SELECT = {
  ...SUMMARY_SELECT,
  reason: true,
  convertedMrnId: true,
  releasedBy: true,
  releasedAt: true,
  version: true,
  lines: {
    select: {
      id: true,
      lineNo: true,
      qty: true,
      item: { select: ITEM_REF_SELECT },
    },
    orderBy: { lineNo: 'asc' },
  },
} as const;

type SummaryRow = Prisma.HoldGetPayload<{ select: typeof SUMMARY_SELECT }>;
type DetailRow = Prisma.HoldGetPayload<{ select: typeof DETAIL_SELECT }>;

function toSummary(row: SummaryRow, seesCustomer: boolean) {
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    department: { id: row.departmentId, name: row.departmentName },
    ...customerRef(seesCustomer, row),
    lineCount: row._count.lines,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class HoldsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
    private readonly stock: StockPostingService,
  ) {}

  async list(policy: Policy, query: HoldQuery): Promise<HoldPage> {
    const seesCustomer = seesHoldCustomer(policy);
    const like = query.q
      ? { contains: query.q, mode: 'insensitive' as const }
      : null;
    const where: Prisma.HoldWhereInput = {
      AND: [
        holdScope(policy),
        query.status === 'ALL' ? {} : { status: query.status },
        like
          ? {
              OR: [
                { number: like },
                { departmentName: like },
                ...(seesCustomer ? [{ customerName: like }] : []),
              ],
            }
          : {},
      ],
    };
    const [rows, total] = await Promise.all([
      this.prisma.hold.findMany({
        where,
        select: SUMMARY_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...pageWindow(query),
      }),
      this.prisma.hold.count({ where }),
    ]);
    return {
      items: rows.map((r) => toSummary(r, seesCustomer)),
      ...pageMeta(query, total),
    };
  }

  async detail(policy: Policy, id: string, scoped = true): Promise<HoldDto> {
    const row = await this.prisma.hold.findFirst({
      where: { id, ...(scoped ? holdScope(policy) : {}) },
      select: DETAIL_SELECT,
    });
    if (!row) notFound('Hold not found.');
    return this.toDetail(policy, row);
  }

  private async toDetail(policy: Policy, row: DetailRow): Promise<HoldDto> {
    const [names, mrn] = await Promise.all([
      userNames(this.prisma, [row.releasedBy]),
      row.convertedMrnId
        ? this.prisma.mrn.findUnique({
            where: { id: row.convertedMrnId },
            select: { id: true, number: true },
          })
        : null,
    ]);
    return {
      ...toSummary(row, seesHoldCustomer(policy)),
      reason: row.reason,
      convertedMrn: mrn,
      released: stampOf(row.releasedBy, row.releasedAt, names),
      version: row.version,
      lines: row.lines.map((l) => ({
        id: l.id,
        lineNo: l.lineNo,
        item: toItemRef(l.item),
        qty: qtyString(l.qty),
      })),
    };
  }

  async create(policy: Policy, input: HoldInput): Promise<HoldDto> {
    const department = await activeDepartment(this.prisma, input.departmentId);
    const customer = await activeCustomer(this.prisma, input.customerId);
    const items = await loadItems(
      this.prisma,
      input.lines.map((l) => l.itemId),
    );
    input.lines.forEach((line, i) => {
      const item = requireItem(items, line.itemId, `lines.${i}.itemId`, true);
      checkQty(item, line.qty, `lines.${i}.qty`);
    });
    const partNo = (itemId: string) => items.get(itemId)?.partNo ?? 'this item';

    try {
      const id = await this.prisma.$transaction(async (tx) => {
        const totals = new Map<string, Prisma.Decimal>();
        for (const l of input.lines) {
          totals.set(
            l.itemId,
            (totals.get(l.itemId) ?? dec(0)).plus(dec(l.qty)),
          );
        }
        for (const [itemId, total] of [...totals].sort(([a], [b]) =>
          a.localeCompare(b),
        )) {
          const free = await this.stock.lockFreeQty(tx, itemId);
          if (free.lt(total)) notEnoughFor(partNo(itemId), qtyString(free));
        }
        const { number } = await this.numbering.next(tx, {
          docType: 'HLD',
          date: new Date(),
        });
        const hold = await tx.hold.create({
          data: {
            number,
            departmentId: department.id,
            departmentName: department.name,
            customerId: customer?.id ?? null,
            customerName: customer?.name ?? null,
            reason: input.reason ?? null,
            createdBy: policy.userId,
            updatedBy: policy.userId,
            lines: {
              create: input.lines.map((l, i) => ({
                lineNo: i + 1,
                itemId: l.itemId,
                qty: l.qty,
              })),
            },
          },
          select: {
            id: true,
            lines: { select: { id: true, itemId: true, qty: true } },
          },
        });
        const lines = [...hold.lines].sort((a, b) =>
          a.itemId.localeCompare(b.itemId),
        );
        for (const line of lines) {
          await this.stock.reserve(tx, {
            source: 'HOLD',
            sourceId: hold.id,
            sourceLineId: line.id,
            itemId: line.itemId,
            qty: line.qty,
          });
        }
        await this.audit.record(
          auditEntry(HOLD_KEY, hold.id, 'create', {
            number,
            departmentId: department.id,
            customerId: customer?.id ?? null,
            reason: input.reason ?? null,
            lines: input.lines,
          }),
          tx,
        );
        return hold.id;
      });
      return this.detail(policy, id, false);
    } catch (error) {
      const itemId = errorItemId(error);
      if (errorCode(error) === 'NOT_ENOUGH_FREE_STOCK' && itemId) {
        notEnoughFor(partNo(itemId), null);
      }
      throw error;
    }
  }

  async release(
    policy: Policy,
    id: string,
    input: { version: number; reason?: string | null },
  ): Promise<HoldDto> {
    const before = await this.prisma.hold.findUnique({
      where: { id },
      select: { status: true, version: true, lines: { select: { id: true } } },
    });
    if (!before) notFound('Hold not found.');
    assertHoldActive(before.status);
    if (before.version !== input.version) stale();
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.hold.updateMany({
        where: { id, version: input.version, status: 'ACTIVE' },
        data: {
          status: 'RELEASED',
          releasedBy: policy.userId,
          releasedAt: new Date(),
          version: { increment: 1 },
          updatedBy: policy.userId,
        },
      });
      if (claimed.count === 0) stale();
      let released = dec(0);
      for (const line of before.lines) {
        released = released.plus(await this.stock.release(tx, 'HOLD', line.id));
      }
      await this.audit.record(
        auditEntry(
          HOLD_KEY,
          id,
          'released',
          { status: 'RELEASED', released: qtyString(released) },
          { before: { status: 'ACTIVE' }, reason: input.reason ?? undefined },
        ),
        tx,
      );
    });
    return this.detail(policy, id, false);
  }
}
