import { Injectable } from '@nestjs/common';
import type { ImportResult } from '@dax/contracts';
import {
  type BarcodeInput,
  type ItemDetail,
  type ItemInput,
  type ItemPage,
  type ItemQuery,
  type ItemStatusInput,
  type ItemSummary,
  type ItemUpdate,
  normalizePartNo,
  type SupersedeInput,
  UOMS,
} from '@dax/inventory-contract';
import { assertWritable, AuditService, type Policy } from '@dax/platform-core';
import {
  Prisma,
  PrismaService,
  type TransactionClient,
} from '@dax/platform-db';
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
} from './common';
import { itemEntity } from './entities';
import {
  itemKey,
  nameKey,
  readItemCsv,
  validateImport,
  type ValidItem,
} from './item-import';
import {
  afterCursor,
  belowMinFilter,
  belowMinIds,
  itemSearch,
  nextOfFor,
} from './item-queries';
import { MainStore } from './main-store.service';
import {
  dec,
  isBelowMin,
  isWhole,
  qtyString,
  stockFigures,
} from './stock-math';
import { createsCycle, latestReplacementId } from './supersession';

const ITEM_REF = {
  id: true,
  partNo: true,
  brand: { select: { name: true } },
} as const;

function summarySelect(storeId: string) {
  return {
    id: true,
    partNo: true,
    description: true,
    uom: true,
    status: true,
    minQty: true,
    brand: { select: { id: true, name: true } },
    supersededBy: { select: ITEM_REF },
    balances: {
      where: { storeId },
      select: { onHand: true, held: true, quarantine: true, receiving: true },
    },
  } as const;
}

function detailSelect(storeId: string) {
  return {
    ...summarySelect(storeId),
    allowFraction: true,
    supersededById: true,
    notes: true,
    version: true,
    createdAt: true,
    updatedAt: true,
    defaultBin: { select: { id: true, code: true } },
    machineModels: {
      select: { machineModel: { select: { id: true, name: true } } },
      orderBy: { machineModel: { name: 'asc' } },
    },
    barcodes: {
      select: { id: true, code: true, kind: true },
      orderBy: { createdAt: 'asc' },
    },
    supersedes: { select: ITEM_REF, orderBy: { partNo: 'asc' } },
    binStock: {
      where: { qty: { gt: 0 } },
      select: { qty: true, bin: { select: { id: true, code: true } } },
      orderBy: { bin: { code: 'asc' } },
    },
  } as const;
}

type SummaryRow = Prisma.ItemGetPayload<{
  select: ReturnType<typeof summarySelect>;
}>;
type DetailRow = Prisma.ItemGetPayload<{
  select: ReturnType<typeof detailSelect>;
}>;
type RefRow = Prisma.ItemGetPayload<{ select: typeof ITEM_REF }>;

const toRef = (row: RefRow) => ({
  id: row.id,
  partNo: row.partNo,
  brand: row.brand.name,
});

export function toSummary(row: SummaryRow): ItemSummary {
  const { figures, onHand } = stockFigures(row.balances[0]);
  return {
    id: row.id,
    partNo: row.partNo,
    brand: row.brand,
    description: row.description,
    uom: row.uom,
    status: row.status,
    supersededBy: row.supersededBy ? toRef(row.supersededBy) : null,
    minQty: qtyString(row.minQty),
    stock: figures,
    belowMin: isBelowMin(onHand, row.minQty),
  };
}

const WRITABLE_KEYS = [
  'partNo',
  'brandId',
  'description',
  'uom',
  'minQty',
  'defaultBinId',
  'notes',
] as const;

type ItemFields = Partial<Pick<ItemInput, (typeof WRITABLE_KEYS)[number]>>;

function writable(input: Record<string, unknown>) {
  return Object.fromEntries(
    WRITABLE_KEYS.filter((k) => input[k] !== undefined).map((k) => [
      k,
      input[k],
    ]),
  );
}

function itemExists(): never {
  conflict(
    'ITEM_EXISTS',
    'An item with this part number already exists for this brand.',
  );
}

@Injectable()
export class ItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly store: MainStore,
  ) {}

  async list(query: ItemQuery): Promise<ItemPage> {
    const storeId = await this.store.id();
    const ids = query.belowMin ? await belowMinIds(this.prisma, storeId) : [];
    const rows = await this.prisma.item.findMany({
      where: {
        AND: [
          query.status === 'ALL' ? {} : { status: query.status },
          query.brandId ? { brandId: query.brandId } : {},
          query.machineModelId
            ? {
                machineModels: {
                  some: { machineModelId: query.machineModelId },
                },
              }
            : {},
          itemSearch(query.q),
          belowMinFilter(query.belowMin, ids),
          afterCursor(query.cursor ? decodeCursor(query.cursor) : null),
        ],
      },
      select: summarySelect(storeId),
      orderBy: [{ partNo: 'asc' }, { id: 'asc' }],
      take: query.limit + 1,
    });
    const page = pageFrom(rows, query.limit, (r) =>
      encodeCursor(r.partNo, r.id),
    );
    return { items: page.rows.map(toSummary), nextCursor: page.nextCursor };
  }

  async detail(policy: Policy, id: string): Promise<ItemDetail> {
    const storeId = await this.store.id();
    const row = await this.prisma.item.findUnique({
      where: { id },
      select: detailSelect(storeId),
    });
    if (!row) notFound('Item not found.');
    return this.toDetail(policy, row);
  }

  private async toDetail(policy: Policy, row: DetailRow): Promise<ItemDetail> {
    const latestId = await latestReplacementId(
      row.supersededById,
      nextOfFor(this.prisma),
    );
    const latest =
      latestId && latestId !== row.supersededBy?.id
        ? await this.prisma.item.findUnique({
            where: { id: latestId },
            select: ITEM_REF,
          })
        : row.supersededBy;
    return {
      ...toSummary(row),
      allowFraction: row.allowFraction,
      defaultBin: row.defaultBin,
      machineModels: row.machineModels.map((m) => m.machineModel),
      barcodes: row.barcodes,
      supersedes: row.supersedes.map(toRef),
      latestReplacement: latest ? toRef(latest) : null,
      notes: canRead(policy, itemEntity, 'notes') ? row.notes : null,
      stockByBin: row.binStock.map((s) => ({
        binId: s.bin.id,
        binCode: s.bin.code,
        qty: qtyString(s.qty),
      })),
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async create(policy: Policy, input: ItemInput): Promise<ItemDetail> {
    assertWritable(itemEntity, policy, writable(input));
    const partNoNorm = this.partNoNorm(input.partNo);
    const allowFraction = this.checkQty(input.uom, input.minQty);
    await this.checkRefs({
      brandId: input.brandId,
      defaultBinId: input.defaultBinId,
      machineModelIds: input.machineModelIds,
    });
    const clash = await this.prisma.item.findUnique({
      where: { brandId_partNoNorm: { brandId: input.brandId, partNoNorm } },
      select: { id: true },
    });
    if (clash) itemExists();

    const id = await this.uniqueGuard(() =>
      this.prisma.$transaction(async (tx) => {
        const created = await tx.item.create({
          data: {
            partNo: input.partNo,
            partNoNorm,
            brandId: input.brandId,
            description: input.description,
            uom: input.uom,
            allowFraction,
            minQty: input.minQty,
            defaultBinId: input.defaultBinId,
            notes: input.notes ?? null,
            qrToken: newQrToken(),
            createdBy: policy.userId,
            updatedBy: policy.userId,
            machineModels: {
              create: input.machineModelIds.map((machineModelId) => ({
                machineModelId,
              })),
            },
          },
          select: { id: true },
        });
        await this.record(tx, created.id, 'create', null, {
          ...writable(input),
          machineModelIds: input.machineModelIds,
        });
        return created.id;
      }),
    );
    return this.detail(policy, id);
  }

  async update(
    policy: Policy,
    id: string,
    input: ItemUpdate,
    present: ReadonlySet<string>,
  ): Promise<ItemDetail> {
    const changes: ItemFields = {};
    for (const key of WRITABLE_KEYS) {
      if (present.has(key) && input[key] !== undefined) {
        Object.assign(changes, { [key]: input[key] });
      }
    }
    const machineModelIds = present.has('machineModelIds')
      ? input.machineModelIds
      : undefined;
    assertWritable(itemEntity, policy, changes);

    const before = await this.prisma.item.findUnique({
      where: { id },
      include: { machineModels: { select: { machineModelId: true } } },
    });
    if (!before) notFound('Item not found.');
    if (before.version !== input.version) stale();

    const brandId = changes.brandId ?? before.brandId;
    const partNoNorm =
      changes.partNo !== undefined
        ? this.partNoNorm(changes.partNo)
        : before.partNoNorm;
    const uom = changes.uom ?? before.uom;
    const minQty = changes.minQty ?? before.minQty.toString();
    const allowFraction = this.checkQty(uom, minQty);
    await this.checkRefs({
      brandId:
        changes.brandId !== undefined && changes.brandId !== before.brandId
          ? brandId
          : undefined,
      defaultBinId:
        changes.defaultBinId && changes.defaultBinId !== before.defaultBinId
          ? changes.defaultBinId
          : null,
      machineModelIds: machineModelIds ?? [],
    });
    if (brandId !== before.brandId || partNoNorm !== before.partNoNorm) {
      const clash = await this.prisma.item.findUnique({
        where: { brandId_partNoNorm: { brandId, partNoNorm } },
        select: { id: true },
      });
      if (clash && clash.id !== id) itemExists();
    }

    await this.uniqueGuard(() =>
      this.prisma.$transaction(async (tx) => {
        const bumped = await tx.item.updateMany({
          where: { id, version: input.version },
          data: {
            ...changes,
            partNoNorm,
            allowFraction,
            version: { increment: 1 },
            updatedBy: policy.userId,
          },
        });
        if (bumped.count === 0) stale();
        if (machineModelIds) {
          await tx.itemMachineModel.deleteMany({ where: { itemId: id } });
          await tx.itemMachineModel.createMany({
            data: machineModelIds.map((machineModelId) => ({
              itemId: id,
              machineModelId,
            })),
            skipDuplicates: true,
          });
        }
        const beforeValues: Record<string, unknown> = Object.fromEntries(
          Object.keys(changes).map((k) => [
            k,
            before[k as keyof typeof before],
          ]),
        );
        const afterValues: Record<string, unknown> = { ...changes };
        if (machineModelIds) {
          beforeValues['machineModelIds'] = before.machineModels
            .map((m) => m.machineModelId)
            .sort();
          afterValues['machineModelIds'] = [...machineModelIds].sort();
        }
        await this.record(tx, id, 'update', beforeValues, afterValues);
      }),
    );
    return this.detail(policy, id);
  }

  async setStatus(
    policy: Policy,
    id: string,
    input: ItemStatusInput,
  ): Promise<ItemDetail> {
    assertWritable(itemEntity, policy, { status: input.status });
    const storeId = await this.store.id();
    const before = await this.prisma.item.findUnique({
      where: { id },
      select: {
        status: true,
        balances: { where: { storeId }, select: { onHand: true } },
      },
    });
    if (!before) notFound('Item not found.');
    if (
      input.status === 'ARCHIVED' &&
      dec(before.balances[0]?.onHand ?? 0).gt(0)
    ) {
      conflict(
        'ITEM_HAS_STOCK',
        'This item still has stock. Move or issue it before archiving.',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      const bumped = await tx.item.updateMany({
        where: { id, version: input.version },
        data: {
          status: input.status,
          version: { increment: 1 },
          updatedBy: policy.userId,
        },
      });
      if (bumped.count === 0) stale();
      await this.record(
        tx,
        id,
        input.status === 'ARCHIVED' ? 'archived' : 'restored',
        { status: before.status },
        { status: input.status },
      );
    });
    return this.detail(policy, id);
  }

  async supersede(
    policy: Policy,
    id: string,
    input: SupersedeInput,
  ): Promise<ItemDetail> {
    assertWritable(itemEntity, policy, { supersededById: input.replacementId });
    const before = await this.prisma.item.findUnique({
      where: { id },
      select: { supersededById: true },
    });
    if (!before) notFound('Item not found.');
    const replacementId = input.replacementId;
    if (replacementId === id)
      invalid('An item cannot replace itself.', ['replacementId']);
    if (replacementId) {
      const exists = await this.prisma.item.findUnique({
        where: { id: replacementId },
        select: { id: true },
      });
      if (!exists)
        invalid('The replacement item does not exist.', ['replacementId']);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('inventory.item.supersession'))`;
      if (
        replacementId &&
        (await createsCycle(id, replacementId, nextOfFor(tx)))
      ) {
        invalid('That would make a loop of replacements.', ['replacementId']);
      }
      const bumped = await tx.item.updateMany({
        where: { id, version: input.version },
        data: {
          supersededById: replacementId,
          version: { increment: 1 },
          updatedBy: policy.userId,
        },
      });
      if (bumped.count === 0) stale();
      await this.record(
        tx,
        id,
        replacementId ? 'superseded' : 'supersession_cleared',
        { supersededById: before.supersededById },
        { supersededById: replacementId },
      );
    });
    return this.detail(policy, id);
  }

  async addBarcode(
    policy: Policy,
    id: string,
    input: BarcodeInput,
  ): Promise<ItemDetail> {
    const item = await this.prisma.item.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!item) notFound('Item not found.');
    const used = await this.prisma.itemBarcode.findUnique({
      where: { code: input.code },
      select: { id: true },
    });
    if (used) barcodeInUse();
    try {
      await this.prisma.$transaction(async (tx) => {
        const created = await tx.itemBarcode.create({
          data: { itemId: id, code: input.code, kind: input.kind },
          select: { id: true },
        });
        await this.record(tx, id, 'barcode_added', null, {
          barcodeId: created.id,
          code: input.code,
          kind: input.kind,
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) barcodeInUse();
      throw error;
    }
    return this.detail(policy, id);
  }

  async removeBarcode(
    policy: Policy,
    id: string,
    barcodeId: string,
  ): Promise<ItemDetail> {
    const barcode = await this.prisma.itemBarcode.findFirst({
      where: { id: barcodeId, itemId: id },
    });
    if (!barcode) notFound('Barcode not found.');
    await this.prisma.$transaction(async (tx) => {
      await tx.itemBarcode.delete({ where: { id: barcodeId } });
      await this.record(
        tx,
        id,
        'barcode_removed',
        { barcodeId, code: barcode.code, kind: barcode.kind },
        null,
      );
    });
    return this.detail(policy, id);
  }

  async import(
    policy: Policy,
    text: string,
    dryRun: boolean,
  ): Promise<ImportResult> {
    const read = readItemCsv(text);
    if (!read.ok)
      return { dryRun, total: read.total, created: 0, errors: read.errors };
    const rows = read.rows;
    const storeId = await this.store.id();
    const norms = [...new Set(rows.map((r) => r.partNoNorm).filter(Boolean))];
    const codes = [...new Set(rows.flatMap((r) => r.barcodes))];
    const binCodes = [
      ...new Set(rows.map((r) => r.defaultBinCode).filter(Boolean)),
    ];
    const [brands, models, bins, existing, barcodes] = await Promise.all([
      this.prisma.brand.findMany({
        select: { id: true, name: true, active: true },
      }),
      this.prisma.machineModel.findMany({ select: { id: true, name: true } }),
      this.prisma.bin.findMany({
        where: {
          storeId,
          code: { in: binCodes },
          active: true,
          kind: 'STORAGE',
        },
        select: { id: true, code: true },
      }),
      this.prisma.item.findMany({
        where: { partNoNorm: { in: norms } },
        select: { brandId: true, partNoNorm: true },
      }),
      this.prisma.itemBarcode.findMany({
        where: { code: { in: codes } },
        select: { code: true },
      }),
    ]);
    const { items, errors } = validateImport(rows, {
      brands: new Map(brands.map((b) => [nameKey(b.name), b])),
      machineModels: new Map(models.map((m) => [nameKey(m.name), m])),
      storageBins: new Map(bins.map((b) => [b.code, b])),
      existingItems: new Set(
        existing.map((e) => itemKey(e.brandId, e.partNoNorm)),
      ),
      barcodesInUse: new Set(barcodes.map((b) => b.code)),
    });
    const result = { dryRun, total: rows.length, created: 0, errors };
    if (errors.length || dryRun) return result;
    assertWritable(itemEntity, policy, {
      partNo: true,
      brandId: true,
      description: true,
      uom: true,
      minQty: true,
      ...(items.some((i) => i.defaultBinId) ? { defaultBinId: true } : {}),
      ...(items.some((i) => i.notes) ? { notes: true } : {}),
    });
    await this.uniqueGuard(() => this.writeImport(policy, items), true);
    return { ...result, created: items.length };
  }

  private writeImport(policy: Policy, items: ValidItem[]) {
    return this.prisma.$transaction(
      async (tx) => {
        for (let i = 0; i < items.length; i += 1000) {
          const chunk = items.slice(i, i + 1000);
          const created = await tx.item.createManyAndReturn({
            data: chunk.map((item) => ({
              partNo: item.partNo,
              partNoNorm: item.partNoNorm,
              brandId: item.brandId,
              description: item.description,
              uom: item.uom,
              allowFraction: item.allowFraction,
              minQty: item.minQty,
              defaultBinId: item.defaultBinId,
              notes: item.notes,
              qrToken: newQrToken(),
              createdBy: policy.userId,
              updatedBy: policy.userId,
            })),
            select: { id: true, brandId: true, partNoNorm: true },
          });
          const idOf = new Map(
            created.map((c) => [itemKey(c.brandId, c.partNoNorm), c.id]),
          );
          const links: { itemId: string; machineModelId: string }[] = [];
          const codes: {
            itemId: string;
            code: string;
            kind: 'MANUFACTURER';
          }[] = [];
          for (const item of chunk) {
            const itemId = idOf.get(itemKey(item.brandId, item.partNoNorm));
            if (!itemId) continue;
            for (const machineModelId of item.machineModelIds)
              links.push({ itemId, machineModelId });
            for (const code of item.barcodes)
              codes.push({ itemId, code, kind: 'MANUFACTURER' });
          }
          if (links.length)
            await tx.itemMachineModel.createMany({ data: links });
          if (codes.length) await tx.itemBarcode.createMany({ data: codes });
        }
        await this.audit.record(
          {
            moduleKey: MODULE_KEY,
            entityKey: itemEntity.key,
            action: 'imported',
            after: { count: items.length },
          },
          tx,
        );
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
  }

  private partNoNorm(partNo: string): string {
    const norm = normalizePartNo(partNo);
    if (!norm)
      invalid('The part number needs at least one letter or digit.', [
        'partNo',
      ]);
    return norm;
  }

  private checkQty(uom: string, minQty: string): boolean {
    const unit = UOMS.find((u) => u.code === uom);
    if (!unit) invalid('Unknown unit.', ['uom']);
    if (!unit.fraction && !isWhole(minQty)) {
      invalid(`Minimum quantity must be a whole number for ${unit.code}.`, [
        'minQty',
      ]);
    }
    return unit.fraction;
  }

  private async checkRefs(refs: {
    brandId?: string;
    defaultBinId: string | null;
    machineModelIds: readonly string[];
  }) {
    const storeId = await this.store.id();
    const ids = [...new Set(refs.machineModelIds)];
    const [brand, bin, models] = await Promise.all([
      refs.brandId
        ? this.prisma.brand.findUnique({
            where: { id: refs.brandId },
            select: { active: true },
          })
        : null,
      refs.defaultBinId
        ? this.prisma.bin.findUnique({
            where: { id: refs.defaultBinId },
            select: { storeId: true, active: true, kind: true },
          })
        : null,
      ids.length
        ? this.prisma.machineModel.count({ where: { id: { in: ids } } })
        : 0,
    ]);
    if (refs.brandId && !brand?.active)
      invalid('Choose an active brand.', ['brandId']);
    if (
      refs.defaultBinId &&
      (!bin || !bin.active || bin.kind !== 'STORAGE' || bin.storeId !== storeId)
    ) {
      invalid('The default bin must be an active storage bin.', [
        'defaultBinId',
      ]);
    }
    if (models !== ids.length)
      invalid('Unknown machine model.', ['machineModelIds']);
  }

  private async uniqueGuard<T>(
    run: () => Promise<T>,
    importing = false,
  ): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (isUniqueViolation(error)) {
        if (importing) {
          conflict(
            'IMPORT_CONFLICT',
            'Some items or barcodes were added meanwhile. Check the file again.',
          );
        }
        itemExists();
      }
      throw error;
    }
  }

  private record(
    tx: TransactionClient,
    entityId: string,
    action: string,
    before: Record<string, unknown> | null,
    after: Record<string, unknown> | null,
  ) {
    return this.audit.record(
      {
        moduleKey: MODULE_KEY,
        entityKey: itemEntity.key,
        entityId,
        action,
        before,
        after,
      },
      tx,
    );
  }
}

function barcodeInUse(): never {
  conflict('BARCODE_IN_USE', 'That barcode is already used by an item.');
}
