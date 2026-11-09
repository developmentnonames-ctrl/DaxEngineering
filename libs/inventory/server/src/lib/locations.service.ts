import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import {
  type BinBulkInput,
  type BinBulkResult,
  type BinDetail,
  type BinDto,
  type BinInput,
  type BinPage,
  type BinQuery,
  type BinUpdate,
  SPECIAL_ZONE_CODE,
  type ZoneDto,
  type ZoneInput,
  type ZoneUpdate,
} from '@dax/inventory-contract';
import { assertWritable, AuditService, type Policy } from '@dax/platform-core';
import {
  Prisma,
  PrismaService,
  type TransactionClient,
} from '@dax/platform-db';
import { binParts, bulkBinParts, splitExisting } from './bin-codes';
import {
  canRead,
  conflict,
  decodeCursor,
  encodeCursor,
  invalid,
  isUniqueViolation,
  MODULE_KEY,
  newQrToken,
  notFound,
  pageFrom,
  stale,
  SYSTEM_ACTOR_ID,
} from './common';
import { binEntity } from './entities';
import { MainStore } from './main-store.service';
import { qtyString } from './stock-math';

export const SPECIAL_BINS = [
  { position: 'RCV', kind: 'RECEIVING' },
  { position: 'QUA', kind: 'QUARANTINE' },
  { position: 'WTY', kind: 'WARRANTY' },
] as const;
export const SPECIAL_BIN_CODES: ReadonlySet<string> = new Set(
  SPECIAL_BINS.map((b) => binParts(SPECIAL_ZONE_CODE, 0, 0, b.position).code),
);

const ZONE_KEY = 'inventory.zone';

const BIN_SELECT = {
  id: true,
  code: true,
  rack: true,
  shelf: true,
  position: true,
  kind: true,
  active: true,
  notes: true,
  version: true,
  zone: { select: { id: true, code: true } },
  _count: { select: { stock: { where: { qty: { gt: 0 } } } } },
} as const;

type BinRow = Prisma.BinGetPayload<{ select: typeof BIN_SELECT }>;

function toBin(policy: Policy, row: BinRow): BinDto {
  return {
    id: row.id,
    code: row.code,
    zone: row.zone,
    rack: row.rack,
    shelf: row.shelf,
    position: row.position,
    kind: row.kind,
    active: row.active,
    itemCount: row._count.stock,
    notes: canRead(policy, binEntity, 'notes') ? row.notes : null,
    version: row.version,
  };
}

@Injectable()
export class LocationsService implements OnModuleInit {
  private readonly logger = new Logger(LocationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly store: MainStore,
  ) {}

  async onModuleInit(): Promise<void> {
    const created = await this.ensureSpecialAreas();
    if (created) this.logger.log(`Created ${created} special area bins`);
  }

  async ensureSpecialAreas(): Promise<number> {
    const storeId = await this.store.id();
    const zone = await this.prisma.zone.upsert({
      where: { storeId_code: { storeId, code: SPECIAL_ZONE_CODE } },
      create: { storeId, code: SPECIAL_ZONE_CODE, name: 'Special areas' },
      update: {},
      select: { id: true },
    });
    const result = await this.prisma.bin.createMany({
      data: SPECIAL_BINS.map((b) => ({
        ...binParts(SPECIAL_ZONE_CODE, 0, 0, b.position),
        storeId,
        zoneId: zone.id,
        kind: b.kind,
        qrToken: newQrToken(),
        createdBy: SYSTEM_ACTOR_ID,
        updatedBy: SYSTEM_ACTOR_ID,
      })),
      skipDuplicates: true,
    });
    return result.count;
  }

  async zones(): Promise<ZoneDto[]> {
    const storeId = await this.store.id();
    const rows = await this.prisma.zone.findMany({
      where: { storeId },
      select: {
        id: true,
        code: true,
        name: true,
        active: true,
        _count: { select: { bins: true } },
      },
      orderBy: { code: 'asc' },
    });
    return rows.map(({ _count, ...z }) => ({ ...z, binCount: _count.bins }));
  }

  async createZone(input: ZoneInput): Promise<ZoneDto> {
    const storeId = await this.store.id();
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const zone = await tx.zone.create({
          data: { storeId, code: input.code, name: input.name },
          select: { id: true, code: true, name: true, active: true },
        });
        await this.record(tx, ZONE_KEY, zone.id, 'create', null, input);
        return zone;
      });
      return { ...row, binCount: 0 };
    } catch (error) {
      if (isUniqueViolation(error))
        conflict('ZONE_EXISTS', 'A zone with that code already exists.');
      throw error;
    }
  }

  async updateZone(id: string, input: ZoneUpdate): Promise<ZoneDto> {
    const storeId = await this.store.id();
    const before = await this.prisma.zone.findFirst({ where: { id, storeId } });
    if (!before) notFound('Zone not found.');
    if (input.active === false && before.active) {
      if (before.code === SPECIAL_ZONE_CODE) {
        invalid('The special areas zone cannot be deactivated.', ['active']);
      }
      const stocked = await this.prisma.binStock.count({
        where: { qty: { gt: 0 }, bin: { zoneId: id } },
      });
      if (stocked)
        conflict('ZONE_HAS_STOCK', 'Bins in this zone still hold stock.');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.zone.update({ where: { id }, data: input });
      await this.record(
        tx,
        ZONE_KEY,
        id,
        'update',
        Object.fromEntries(
          Object.keys(input).map((k) => [k, before[k as keyof typeof before]]),
        ),
        input,
      );
    });
    const zones = await this.zones();
    const zone = zones.find((z) => z.id === id);
    if (!zone) notFound('Zone not found.');
    return zone;
  }

  async bins(policy: Policy, query: BinQuery): Promise<BinPage> {
    const storeId = await this.store.id();
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    const q = query.q?.trim().toUpperCase();
    const rows = await this.prisma.bin.findMany({
      where: {
        storeId,
        ...(query.zoneId ? { zoneId: query.zoneId } : {}),
        ...(query.kind ? { kind: query.kind } : {}),
        ...(query.active === 'all' ? {} : { active: query.active === 'true' }),
        ...(q ? { code: { contains: q } } : {}),
        ...(cursor
          ? {
              OR: [
                { code: { gt: cursor.key } },
                { code: cursor.key, id: { gt: cursor.id } },
              ],
            }
          : {}),
      },
      select: BIN_SELECT,
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
      take: query.limit + 1,
    });
    const page = pageFrom(rows, query.limit, (r) => encodeCursor(r.code, r.id));
    return {
      items: page.rows.map((r) => toBin(policy, r)),
      nextCursor: page.nextCursor,
    };
  }

  async bin(policy: Policy, id: string): Promise<BinDetail> {
    const row = await this.prisma.bin.findUnique({
      where: { id },
      select: {
        ...BIN_SELECT,
        stock: {
          where: { qty: { gt: 0 } },
          select: {
            qty: true,
            item: {
              select: {
                id: true,
                partNo: true,
                description: true,
                uom: true,
                brand: { select: { name: true } },
              },
            },
          },
          orderBy: { item: { partNo: 'asc' } },
        },
      },
    });
    if (!row) notFound('Bin not found.');
    return {
      ...toBin(policy, row),
      stock: row.stock.map((s) => ({
        itemId: s.item.id,
        partNo: s.item.partNo,
        brand: s.item.brand.name,
        description: s.item.description,
        uom: s.item.uom,
        qty: qtyString(s.qty),
      })),
    };
  }

  private async activeZone(zoneId: string) {
    const storeId = await this.store.id();
    const zone = await this.prisma.zone.findFirst({
      where: { id: zoneId, storeId },
      select: { id: true, code: true, active: true },
    });
    if (!zone) invalid('Unknown zone.', ['zoneId']);
    if (!zone.active) invalid('That zone is inactive.', ['zoneId']);
    return { ...zone, storeId };
  }

  async createBin(policy: Policy, input: BinInput): Promise<BinDto> {
    assertWritable(binEntity, policy, { kind: input.kind, notes: input.notes });
    const zone = await this.activeZone(input.zoneId);
    const parts = binParts(zone.code, input.rack, input.shelf, input.position);
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const bin = await tx.bin.create({
          data: {
            ...parts,
            storeId: zone.storeId,
            zoneId: zone.id,
            kind: input.kind,
            notes: input.notes ?? null,
            qrToken: newQrToken(),
            createdBy: policy.userId,
            updatedBy: policy.userId,
          },
          select: BIN_SELECT,
        });
        await this.record(tx, binEntity.key, bin.id, 'create', null, {
          code: parts.code,
          kind: input.kind,
          notes: input.notes ?? null,
        });
        return bin;
      });
      return toBin(policy, row);
    } catch (error) {
      if (isUniqueViolation(error))
        conflict('BIN_EXISTS', `Bin ${parts.code} already exists.`);
      throw error;
    }
  }

  async bulkCreate(
    policy: Policy,
    input: BinBulkInput,
  ): Promise<BinBulkResult> {
    assertWritable(binEntity, policy, { kind: input.kind });
    const zone = await this.activeZone(input.zoneId);
    const parts = bulkBinParts(zone.code, input);
    const existing = await this.prisma.bin.findMany({
      where: { storeId: zone.storeId, code: { in: parts.map((p) => p.code) } },
      select: { code: true },
    });
    const { create, skipped } = splitExisting(
      parts,
      new Set(existing.map((e) => e.code)),
    );
    if (create.length === 0) return { created: 0, skipped };
    const created = await this.prisma.$transaction(async (tx) => {
      const result = await tx.bin.createMany({
        data: create.map((p) => ({
          ...p,
          storeId: zone.storeId,
          zoneId: zone.id,
          kind: input.kind,
          qrToken: newQrToken(),
          createdBy: policy.userId,
          updatedBy: policy.userId,
        })),
        skipDuplicates: true,
      });
      await this.audit.record(
        {
          moduleKey: MODULE_KEY,
          entityKey: binEntity.key,
          action: 'bulk_created',
          after: { zone: zone.code, kind: input.kind, count: result.count },
        },
        tx,
      );
      return result.count;
    });
    return { created, skipped };
  }

  async updateBin(
    policy: Policy,
    id: string,
    input: BinUpdate,
  ): Promise<BinDto> {
    const { version, ...changes } = input;
    assertWritable(binEntity, policy, changes);
    const before = await this.prisma.bin.findUnique({ where: { id } });
    if (!before) notFound('Bin not found.');
    if (before.version !== version) stale();
    const kindChange =
      changes.kind !== undefined && changes.kind !== before.kind;
    const deactivating = changes.active === false && before.active;
    if (SPECIAL_BIN_CODES.has(before.code) && (kindChange || deactivating)) {
      invalid('Special area bins cannot be changed or deactivated.', [
        'kind',
        'active',
      ]);
    }
    if (deactivating) {
      const stocked = await this.prisma.binStock.count({
        where: { binId: id, qty: { gt: 0 } },
      });
      if (stocked)
        conflict(
          'BIN_HAS_STOCK',
          'This bin still holds stock. Move it out first.',
        );
    }
    const data: Prisma.BinUncheckedUpdateManyInput = {
      ...(changes.kind !== undefined ? { kind: changes.kind } : {}),
      ...(changes.active !== undefined ? { active: changes.active } : {}),
      ...(changes.notes !== undefined ? { notes: changes.notes } : {}),
    };
    await this.prisma.$transaction(async (tx) => {
      const bumped = await tx.bin.updateMany({
        where: { id, version },
        data: { ...data, version: { increment: 1 }, updatedBy: policy.userId },
      });
      if (bumped.count === 0) stale();
      await this.record(
        tx,
        binEntity.key,
        id,
        'update',
        Object.fromEntries(
          Object.keys(data).map((k) => [k, before[k as keyof typeof before]]),
        ),
        data as Record<string, unknown>,
      );
    });
    const row = await this.prisma.bin.findUniqueOrThrow({
      where: { id },
      select: BIN_SELECT,
    });
    return toBin(policy, row);
  }

  private record(
    tx: TransactionClient,
    entityKey: string,
    entityId: string,
    action: string,
    before: Record<string, unknown> | null,
    after: Record<string, unknown>,
  ) {
    return this.audit.record(
      { moduleKey: MODULE_KEY, entityKey, entityId, action, before, after },
      tx,
    );
  }
}
