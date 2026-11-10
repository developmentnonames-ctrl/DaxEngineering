import { pageMeta, pageWindow } from '@dax/contracts';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import type {
  DiscrepancyDto,
  DiscrepancyPage,
  DiscrepancyQuery,
} from '@dax/inventory-contract';
import {
  AttachmentAccessRegistry,
  AuditService,
  can,
  type Policy,
} from '@dax/platform-core';
import { type Prisma, PrismaService } from '@dax/platform-db';
import { conflict, MODULE_KEY, notFound, stale } from '../common';
import { qtyString } from '../stock-math';
import {
  auditEntry,
  DISCREPANCY_KEY,
  type Db,
  ITEM_REF_SELECT,
  stampOf,
  toItemRef,
  userNames,
} from './shared';

const SELECT = {
  id: true,
  kind: true,
  qty: true,
  status: true,
  notes: true,
  closeNote: true,
  closedBy: true,
  closedAt: true,
  createdAt: true,
  version: true,
  grn: {
    select: { id: true, number: true, supplierId: true, supplierName: true },
  },
  item: { select: ITEM_REF_SELECT },
} as const;

type Row = Prisma.DiscrepancyGetPayload<{ select: typeof SELECT }>;

function search(q: string | undefined) {
  if (!q) return {};
  const like = { contains: q, mode: 'insensitive' as const };
  return {
    OR: [
      { grn: { number: like } },
      { grn: { supplierName: like } },
      { item: { partNo: like } },
      { item: { description: like } },
    ],
  };
}

@Injectable()
export class DiscrepanciesService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly attachments: AttachmentAccessRegistry,
  ) {}

  onModuleInit(): void {
    this.attachments.register(DISCREPANCY_KEY, {
      moduleKey: MODULE_KEY,
      canView: async (policy, id, tx) =>
        can(policy, 'inventory.discrepancy.view') &&
        (await this.statusOf(tx ?? this.prisma, id)) !== null,
      canAttach: async (policy, id) =>
        can(policy, 'inventory.discrepancy.report') &&
        (await this.statusOf(this.prisma, id)) === 'OPEN',
    });
  }

  private async statusOf(db: Db, id: string): Promise<string | null> {
    const row = await db.discrepancy.findUnique({
      where: { id },
      select: { status: true },
    });
    return row?.status ?? null;
  }

  async list(query: DiscrepancyQuery): Promise<DiscrepancyPage> {
    const where: Prisma.DiscrepancyWhereInput = {
      AND: [
        query.status === 'ALL' ? {} : { status: query.status },
        search(query.q),
      ],
    };
    const [rows, total] = await Promise.all([
      this.prisma.discrepancy.findMany({
        where,
        select: SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...pageWindow(query),
      }),
      this.prisma.discrepancy.count({ where }),
    ]);
    return { items: await this.toDtos(rows), ...pageMeta(query, total) };
  }

  async detail(id: string): Promise<DiscrepancyDto> {
    const row = await this.prisma.discrepancy.findUnique({
      where: { id },
      select: SELECT,
    });
    if (!row) notFound('Discrepancy not found.');
    const [dto] = await this.toDtos([row]);
    if (!dto) notFound('Discrepancy not found.');
    return dto;
  }

  private async toDtos(rows: readonly Row[]): Promise<DiscrepancyDto[]> {
    const names = await userNames(
      this.prisma,
      rows.map((r) => r.closedBy),
    );
    return rows.map((r) => ({
      id: r.id,
      grn: { id: r.grn.id, number: r.grn.number },
      supplier: { id: r.grn.supplierId, name: r.grn.supplierName },
      item: toItemRef(r.item),
      kind: r.kind,
      qty: qtyString(r.qty),
      status: r.status,
      notes: r.notes,
      closeNote: r.closeNote,
      createdAt: r.createdAt.toISOString(),
      closed: stampOf(r.closedBy, r.closedAt, names),
      version: r.version,
    }));
  }

  async updateNotes(
    id: string,
    input: { version: number; notes?: string | null },
  ): Promise<DiscrepancyDto> {
    const before = await this.open(id, input.version);
    const notes = input.notes ?? null;
    await this.prisma.$transaction(async (tx) => {
      const bumped = await tx.discrepancy.updateMany({
        where: { id, version: input.version, status: 'OPEN' },
        data: { notes, version: { increment: 1 } },
      });
      if (bumped.count === 0) stale();
      await this.audit.record(
        auditEntry(
          DISCREPANCY_KEY,
          id,
          'update',
          { notes },
          { before: { notes: before.notes } },
        ),
        tx,
      );
    });
    return this.detail(id);
  }

  async close(
    policy: Policy,
    id: string,
    input: { version: number; note: string },
  ): Promise<DiscrepancyDto> {
    await this.open(id, input.version);
    await this.prisma.$transaction(async (tx) => {
      const bumped = await tx.discrepancy.updateMany({
        where: { id, version: input.version, status: 'OPEN' },
        data: {
          status: 'CLOSED',
          closeNote: input.note,
          closedBy: policy.userId,
          closedAt: new Date(),
          version: { increment: 1 },
        },
      });
      if (bumped.count === 0) stale();
      await this.audit.record(
        auditEntry(
          DISCREPANCY_KEY,
          id,
          'closed',
          { status: 'CLOSED', closeNote: input.note },
          { before: { status: 'OPEN' } },
        ),
        tx,
      );
    });
    return this.detail(id);
  }

  private async open(id: string, version: number) {
    const row = await this.prisma.discrepancy.findUnique({
      where: { id },
      select: { status: true, version: true, notes: true },
    });
    if (!row) notFound('Discrepancy not found.');
    if (row.status !== 'OPEN') {
      conflict('INVALID_STATE', 'This discrepancy is already closed.');
    }
    if (row.version !== version) stale();
    return row;
  }
}
