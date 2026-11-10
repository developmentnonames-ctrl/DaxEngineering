import { randomBytes } from 'node:crypto';
import {
  AttachmentAccessRegistry,
  AuditService,
  NumberingService,
} from '@dax/platform-core';
import type { RequestContext } from '@dax/platform-core';
import { PrismaService } from '@dax/platform-db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INVENTORY_ENTITIES } from '../entities';
import { LocationsService } from '../locations.service';
import { MainStore } from '../main-store.service';
import { fakePolicy } from '../testing';
import { WarrantyService } from './warranty.service';

const url = process.env['TEST_DATABASE_URL'];
const ACTOR = '00000000-0000-0000-0000-000000000001';

describe.skipIf(!url)(
  'warranty bin against Postgres',
  { timeout: 30_000 },
  () => {
    let prisma: PrismaService;
    let warranty: WarrantyService;
    let supplierId: string;
    let customerId: string;
    let modelId: string;
    let itemId: string;
    let warrantyBin: string;
    const policy = fakePolicy([
      'inventory.warranty.view',
      'inventory.warranty.tag',
      'inventory.warranty.send',
      'inventory.warranty.close',
    ]);

    const token = () => randomBytes(8).toString('hex').slice(0, 12);
    const stockTrace = async () => ({
      ledger: await prisma.stockLedger.count({ where: { itemId } }),
      balance: await prisma.stockBalance.findFirst({
        where: { itemId },
        select: { onHand: true, held: true, quarantine: true, receiving: true },
      }),
      bins: await prisma.binStock.findMany({
        where: { itemId },
        select: { binId: true, qty: true },
      }),
    });

    beforeAll(async () => {
      prisma = new PrismaService({
        url: url as string,
        applicationName: 'dax-test',
      });
      const context = { get: () => ({}) } as unknown as RequestContext;
      const store = new MainStore(prisma);
      const audit = new AuditService(prisma, context, [...INVENTORY_ENTITIES]);
      warranty = new WarrantyService(
        prisma,
        audit,
        new NumberingService(),
        store,
        new AttachmentAccessRegistry(),
      );
      await new LocationsService(prisma, audit, store).ensureSpecialAreas();
      await prisma.numberSeries.upsert({
        where: { docType_subtype: { docType: 'WTY', subtype: '' } },
        create: {
          moduleKey: 'inventory',
          docType: 'WTY',
          subtype: '',
          name: 'Warranty tag',
          pattern: '{DOC}/{FY}/{SEQ}',
        },
        update: {},
      });

      const suffix = token().toUpperCase();
      supplierId = (
        await prisma.supplier.create({
          data: {
            code: `SUP-W${suffix}`,
            name: `Warranty supplier ${suffix}`,
            createdBy: ACTOR,
            updatedBy: ACTOR,
          },
        })
      ).id;
      customerId = (
        await prisma.customer.create({
          data: {
            code: `CUS-W${suffix}`,
            name: `Warranty customer ${suffix}`,
            createdBy: ACTOR,
            updatedBy: ACTOR,
          },
        })
      ).id;
      const brand = await prisma.brand.create({
        data: { name: `Warranty ${suffix}` },
      });
      modelId = (
        await prisma.machineModel.create({
          data: { name: `Model ${suffix}`, brandId: brand.id },
        })
      ).id;
      itemId = (
        await prisma.item.create({
          data: {
            partNo: `W-${suffix}`,
            partNoNorm: `W${suffix}`,
            brandId: brand.id,
            description: 'Warranty test part',
            uom: 'PCS',
            qrToken: token(),
            createdBy: ACTOR,
            updatedBy: ACTOR,
          },
        })
      ).id;
      const storeRow = await prisma.store.findUniqueOrThrow({
        where: { code: 'MAIN' },
      });
      warrantyBin = (
        await prisma.bin.findFirstOrThrow({
          where: { storeId: storeRow.id, code: { endsWith: '-WTY' } },
          select: { id: true },
        })
      ).id;
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    it('tags, sends and closes a part without touching stock', async () => {
      const before = await stockTrace();

      const tagged = await warranty.create(policy, {
        itemId,
        qty: '1',
        serialNo: 'SN-1',
        machineModelId: modelId,
        machineSerial: 'MS-1',
        jobNumber: 'J-1',
        customerId,
        fault: 'Seized after two hours',
      });
      expect(tagged.number).toMatch(/^WTY\//);
      expect(tagged.status).toBe('TAGGED');
      expect(tagged.bin.id).toBe(warrantyBin);
      expect(tagged.machineModel?.id).toBe(modelId);
      expect(tagged.customer?.id).toBe(customerId);
      expect(tagged.returnNote).toBeNull();

      const edited = await warranty.update(policy, tagged.id, {
        version: tagged.version,
        jobNumber: 'J-2',
      });
      expect(edited.jobNumber).toBe('J-2');
      expect(edited.version).toBe(tagged.version + 1);

      const sent = await warranty.send(policy, tagged.id, {
        version: edited.version,
        supplierId,
        claimNumber: 'CLM-1',
      });
      expect(sent.status).toBe('SENT');
      expect(sent.supplier?.id).toBe(supplierId);
      expect(sent.sent).not.toBeNull();

      const open = await warranty.list(policy, {
        status: 'OPEN',
        q: 'CLM-1',
        page: 1,
        limit: 50,
      });
      expect(open.items.map((t) => t.id)).toContain(tagged.id);

      const closed = await warranty.close(policy, tagged.id, {
        version: sent.version,
        outcome: 'SCRAPPED',
        note: 'Supplier asked us to scrap it',
      });
      expect(closed.status).toBe('CLOSED');
      expect(closed.outcome).toBe('SCRAPPED');
      expect(closed.closed).not.toBeNull();

      expect(await stockTrace()).toEqual(before);
      expect(
        await prisma.stockLedger.count({ where: { binId: warrantyBin } }),
      ).toBe(0);
      const actions = await prisma.auditLog.findMany({
        where: { entityId: tagged.id },
        select: { action: true },
      });
      expect(actions.map((a) => a.action).sort()).toEqual([
        'closed',
        'create',
        'sent',
        'update',
      ]);
    });

    it('refuses a stale send', async () => {
      const tagged = await warranty.create(policy, {
        itemId,
        qty: '1',
        fault: 'Leaks oil at the seal',
      });
      await warranty.update(policy, tagged.id, {
        version: tagged.version,
        serialNo: 'SN-2',
      });
      await expect(
        warranty.send(policy, tagged.id, {
          version: tagged.version,
          supplierId,
        }),
      ).rejects.toMatchObject({ response: { code: 'STALE' } });
    });
  },
);
