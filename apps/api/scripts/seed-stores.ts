// Dev only. Fills the main store with sample masters, opening stock and
// documents in every stage (receiving, issuing, returns, warranty, counts).
// Run: pnpm db:seed:stores   Undo: pnpm db:unseed:stores
//
// Everything goes through the real services, so codes, QR tokens, numbering
// and the stock ledger follow the same rules as the app. Every row is created
// by one of two inactive "Seed data" accounts, which is how the reverse finds it.
import {
  AuditService,
  type EntityDef,
  NumberingService,
  type Policy,
  type RequestContext,
} from '@dax/platform-core';
import { PrismaService } from '@dax/platform-db';
import {
  brandEntity,
  INVENTORY_ENTITIES,
  ItemsService,
  machineModelEntity,
  LocationsService,
  MainStore,
  StockPostingService,
} from '@dax/inventory-server';
import {
  CUSTOMERS as CUSTOMER_KIND,
  PARTIES_ENTITIES,
  PartiesService,
  SUPPLIERS as SUPPLIER_KIND,
} from '@dax/parties-server';
// The library doesn't export the count service, and this dev-only script is
// the one place outside it that needs to post an opening count directly.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { CountsService } from '../../../libs/inventory/server/src/lib/counts/counts.service';
import { assertLocalDatabase } from './seed-guard';
import { seedDocuments } from './stores-seed-documents';
import {
  BIN_LAYOUT,
  BRANDS,
  CUSTOMERS,
  ITEMS,
  MACHINE_MODELS,
  SEED_USERS,
  SUPPLIERS,
  ZONES,
} from './stores-seed-data';

const ENTITIES: EntityDef[] = [...INVENTORY_ENTITIES, ...PARTIES_ENTITIES];

/** A policy that can read and write every field, for the given seed user. */
function seedPolicy(userId: string): Policy {
  const fields = new Map(
    ENTITIES.map((def) => [
      def.key,
      {
        read: new Set(Object.keys(def.fields)),
        write: new Set(
          Object.entries(def.fields)
            .filter(([, meta]) => meta.writable)
            .map(([name]) => name),
        ),
      },
    ]),
  );
  const permissions = [
    'inventory.count.view',
    'inventory.count.create',
    'inventory.count.count',
    'inventory.count.submit',
    'inventory.count.approve',
    'inventory.item.view',
    'inventory.stock.view',
    'inventory.hold.view',
    'inventory.mrn.view',
    'inventory.mrn.create',
    'inventory.aod.view',
  ];
  return {
    userId,
    isSuperAdmin: false,
    require2fa: false,
    departmentIds: [],
    roleIds: [],
    enabledModules: new Set(['inventory', 'parties']),
    permissions: new Map(
      permissions.map((p) => [p, { scope: 'ALL' as const, storeIds: [] }]),
    ),
    sources: new Map(),
    denied: new Set(),
    fields,
    validUntil: Number.MAX_SAFE_INTEGER,
    version: 'seed',
  };
}

/** Audit rows written by a service carry whichever seed user is acting. */
function contextFor(actor: { id: string; name: string }) {
  return { get: () => ({ actor }) } as unknown as RequestContext;
}

async function main() {
  const url = process.env['DATABASE_URL'];
  if (!url)
    throw new Error(
      'DATABASE_URL is not set. Run through pnpm db:seed:stores.',
    );
  assertLocalDatabase(url);

  const prisma = new PrismaService({ url, applicationName: 'dax-seed' });
  try {
    const already = await prisma.user.count({
      where: { id: SEED_USERS.keeper.id },
    });
    if (already > 0) {
      console.log(
        'Stores seed is already in this database. Run pnpm db:unseed:stores first to start again.',
      );
      return;
    }

    const keeper = seedPolicy(SEED_USERS.keeper.id);
    const approver = seedPolicy(SEED_USERS.approver.id);
    const keeperCtx = contextFor(SEED_USERS.keeper);
    const approverCtx = contextFor(SEED_USERS.approver);

    const store = new MainStore(prisma);
    const numbering = new NumberingService();
    const keeperAudit = new AuditService(prisma, keeperCtx, ENTITIES);
    const locations = new LocationsService(prisma, keeperAudit, store);
    const items = new ItemsService(prisma, keeperAudit, store);
    const parties = new PartiesService(prisma, numbering, keeperAudit);
    const engine = new StockPostingService(store, keeperCtx);
    const countsAs = (ctx: RequestContext) =>
      new CountsService(
        prisma,
        new AuditService(prisma, ctx, ENTITIES),
        numbering,
        engine,
        store,
      );

    // Inactive accounts with no password: they only label who made the data.
    console.log('Seed accounts');
    for (const u of Object.values(SEED_USERS)) {
      await prisma.user.create({
        data: { id: u.id, name: u.name, email: u.email, active: false },
      });
    }
    await locations.ensureSpecialAreas();

    // Brands and models have no "created by", so each one the seed creates gets
    // an audit "create" row from the seed user. The reverse removes only those,
    // and reuses (never deletes) any that were already here.
    console.log(
      `Brands (${BRANDS.length}) and machine models (${MACHINE_MODELS.length})`,
    );
    const brandId = new Map<string, string>();
    for (const name of BRANDS) {
      const found = await prisma.brand.findUnique({
        where: { name },
        select: { id: true },
      });
      const id =
        found?.id ??
        (await prisma.$transaction(async (tx) => {
          const row = await tx.brand.create({
            data: { name },
            select: { id: true },
          });
          await keeperAudit.record(
            {
              moduleKey: 'inventory',
              entityKey: brandEntity.key,
              entityId: row.id,
              action: 'create',
              after: { name },
            },
            tx,
          );
          return row.id;
        }));
      brandId.set(name, id);
    }
    const modelId = new Map<string, string>();
    for (const m of MACHINE_MODELS) {
      const found = await prisma.machineModel.findUnique({
        where: { name: m.name },
        select: { id: true },
      });
      const id =
        found?.id ??
        (await prisma.$transaction(async (tx) => {
          const data = { name: m.name, brandId: brandId.get(m.brand) ?? null };
          const row = await tx.machineModel.create({
            data,
            select: { id: true },
          });
          await keeperAudit.record(
            {
              moduleKey: 'inventory',
              entityKey: machineModelEntity.key,
              entityId: row.id,
              action: 'create',
              after: data,
            },
            tx,
          );
          return row.id;
        }));
      modelId.set(m.name, id);
    }

    console.log(`Zones (${ZONES.length}) and bins`);
    const zoneIds: string[] = [];
    for (const z of ZONES) {
      const zone = await locations.createZone(z);
      zoneIds.push(zone.id);
      await locations.bulkCreate(keeper, {
        zoneId: zone.id,
        kind: 'STORAGE',
        ...BIN_LAYOUT,
      });
    }
    const bins = await prisma.bin.findMany({
      where: { createdBy: SEED_USERS.keeper.id },
      select: { id: true, code: true },
    });
    const binId = new Map(bins.map((b) => [b.code, b.id]));
    const need = (map: Map<string, string>, key: string, what: string) => {
      const id = map.get(key);
      if (!id) throw new Error(`Seed data names an unknown ${what}: ${key}`);
      return id;
    };

    console.log(`Items (${ITEMS.length})`);
    const itemId = new Map<string, string>();
    for (const it of ITEMS) {
      const created = await items.create(keeper, {
        partNo: it.partNo,
        brandId: need(brandId, it.brand, 'brand'),
        description: it.description,
        uom: it.uom,
        minQty: it.minQty,
        defaultBinId: need(binId, it.stock[0][0], 'bin'),
        machineModelIds: it.models.map((m) =>
          need(modelId, m, 'machine model'),
        ),
      });
      itemId.set(`${it.brand}|${it.partNo}`, created.id);
    }

    console.log(
      `Customers (${CUSTOMERS.length}) and suppliers (${SUPPLIERS.length})`,
    );
    const actor = { userId: SEED_USERS.keeper.id, policy: keeper };
    for (const c of CUSTOMERS) await parties.create(CUSTOMER_KIND, actor, c);
    for (const s of SUPPLIERS) await parties.create(SUPPLIER_KIND, actor, s);

    // Opening stock goes through an opening count, the same way a real store
    // would load it: the keeper counts and submits, a second person approves.
    console.log('Opening count');
    const keeperCounts = countsAs(keeperCtx);
    let count = await keeperCounts.create(keeper, {
      kind: 'OPENING',
      blind: false,
      notes: 'Opening stock from the stores seed.',
      zoneIds,
      binIds: [],
    });
    let lines = 0;
    for (const it of ITEMS) {
      for (const [bin, qty] of it.stock) {
        if (Number(qty) <= 0) continue;
        count = await keeperCounts.addLine(keeper, count.id, {
          version: count.version,
          binId: need(binId, bin, 'bin'),
          itemId: need(itemId, `${it.brand}|${it.partNo}`, 'item'),
          countedQty: qty,
        });
        lines++;
      }
    }
    count = await keeperCounts.submit(keeper, count.id, count.version);
    count = await countsAs(approverCtx).approve(
      approver,
      count.id,
      count.version,
    );

    const documents = await seedDocuments({
      prisma,
      keeper,
      keeperCtx,
      entities: ENTITIES,
      store,
      engine,
    });

    console.log('');
    console.log(
      `Done. Opening count ${count.number} posted ${lines} stock lines.`,
    );
    console.log(
      `${ZONES.length} zones, ${bins.length} bins, ${ITEMS.length} items, ${CUSTOMERS.length} customers, ${SUPPLIERS.length} suppliers.`,
    );
    for (const line of documents) console.log(`  ${line}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
