import { randomBytes, randomUUID } from 'node:crypto';
import {
  AuditService,
  NumberingService,
  type Policy,
  type RequestContext,
} from '@dax/platform-core';
import { PrismaService } from '@dax/platform-db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INVENTORY_ENTITIES } from '../entities';
import { MainStore } from '../main-store.service';
import { qtyString } from '../stock-math';
import { findMismatches } from '../stock/reconcile';
import { StockPostingService } from '../stock/stock-posting.service';
import { fakePolicy } from '../testing';
import { CountsService } from './counts.service';

const url = process.env['TEST_DATABASE_URL'];
const ACTOR = '00000000-0000-0000-0000-000000000001';

describe.skipIf(!url)(
  'stock counts against Postgres',
  { timeout: 60_000 },
  () => {
    let prisma: PrismaService;
    let engine: StockPostingService;
    let counts: CountsService;
    let storeId: string;
    let zoneId: string;
    let itemA: string;
    let itemB: string;
    let partB: string;
    let zoneCode = '';
    const keeper = fakePolicy([
      'inventory.count.view',
      'inventory.count.count',
      'inventory.count.submit',
    ]);
    const manager: Policy = {
      ...fakePolicy([
        'inventory.count.view',
        'inventory.count.create',
        'inventory.count.count',
        'inventory.count.submit',
        'inventory.count.approve',
        'inventory.count.cancel',
      ]),
      userId: '0190a000-0000-7000-8000-0000000000cc',
    };

    const token = () => randomBytes(8).toString('hex').slice(0, 12);
    const letters = (n: number) =>
      [...randomBytes(n)]
        .map((b) => String.fromCharCode(65 + (b % 26)))
        .join('');
    const failure = async (promise: Promise<unknown>) => {
      try {
        await promise;
      } catch (error) {
        return error as { response?: { code?: string; message?: string } };
      }
      throw new Error('Expected a failure');
    };
    const newBin = async (position: string) =>
      (
        await prisma.bin.create({
          data: {
            storeId,
            zoneId,
            code: `${zoneCode}-01-01-${position}`,
            rack: '01',
            shelf: '01',
            position,
            kind: 'STORAGE',
            qrToken: token(),
            createdBy: ACTOR,
            updatedBy: ACTOR,
          },
        })
      ).id;
    const post = (itemId: string, binId: string, qty: string) =>
      prisma.$transaction((tx) =>
        engine.post(
          tx,
          [
            {
              itemId,
              binId,
              qty,
              movement: 'PUTAWAY_IN',
              docType: 'TEST',
              docId: randomUUID(),
            },
          ],
          ACTOR,
        ),
      );
    const binQty = async (binId: string, itemId: string) =>
      qtyString(
        (
          await prisma.binStock.findUnique({
            where: { binId_itemId: { binId, itemId } },
            select: { qty: true },
          })
        )?.qty ?? 0,
      );

    beforeAll(async () => {
      prisma = new PrismaService({
        url: url as string,
        applicationName: 'dax-test',
      });
      const context = { get: () => ({}) } as unknown as RequestContext;
      const store = new MainStore(prisma);
      const audit = new AuditService(prisma, context, [...INVENTORY_ENTITIES]);
      engine = new StockPostingService(store, context);
      counts = new CountsService(
        prisma,
        audit,
        new NumberingService(),
        engine,
        store,
      );
      await prisma.numberSeries.upsert({
        where: { docType_subtype: { docType: 'CNT', subtype: '' } },
        create: {
          moduleKey: 'inventory',
          docType: 'CNT',
          subtype: '',
          name: 'Stock count',
          pattern: '{DOC}/{FY}/{SEQ}',
        },
        update: {},
      });
      storeId = (
        await prisma.store.findUniqueOrThrow({ where: { code: 'MAIN' } })
      ).id;
      zoneCode = letters(3);
      zoneId = (
        await prisma.zone.create({
          data: { storeId, code: zoneCode, name: 'Count test zone' },
        })
      ).id;
      const suffix = token().toUpperCase();
      const brand = await prisma.brand.create({
        data: { name: `Counts ${suffix}` },
      });
      const item = (n: string) =>
        prisma.item.create({
          data: {
            partNo: `C${n}-${suffix}`,
            partNoNorm: `C${n}${suffix}`,
            brandId: brand.id,
            description: 'Count test part',
            uom: 'PCS',
            qrToken: token(),
            createdBy: ACTOR,
            updatedBy: ACTOR,
          },
        });
      itemA = (await item('A')).id;
      const b = await item('B');
      itemB = b.id;
      partB = b.partNo;
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    it('freezes its bins against other postings until it is cancelled', async () => {
      const bin = await newBin('A');
      await post(itemA, bin, '4');
      const count = await counts.create(manager, {
        kind: 'CYCLE',
        blind: false,
        zoneIds: [],
        binIds: [bin],
      });
      expect(count.number).toMatch(/^CNT\/\d{2}\/\d{4}$/);
      expect(count.bins.map((b) => b.lines.map((l) => l.systemQty))).toEqual([
        ['4'],
      ]);

      const blocked = await failure(post(itemA, bin, '1'));
      expect(blocked.response?.code).toBe('BIN_COUNTING');
      const second = await failure(
        counts.create(manager, {
          kind: 'CYCLE',
          blind: false,
          zoneIds: [],
          binIds: [bin],
        }),
      );
      expect(second.response?.code).toBe('BIN_COUNTING');
      expect(second.response?.message).toContain(count.number);

      await counts.cancel(manager, count.id, {
        version: count.version,
        reason: 'Wrong bins chosen',
      });
      await post(itemA, bin, '1');
      expect(await binQty(bin, itemA)).toBe('5');
    });

    it('approves a blind count and reconciles the stock', async () => {
      const bin = await newBin('B');
      await post(itemA, bin, '10');
      const created = await counts.create(manager, {
        kind: 'CYCLE',
        blind: true,
        zoneIds: [],
        binIds: [bin],
      });
      const sheet = await counts.detail(keeper, created.id);
      expect(sheet.systemVisible).toBe(false);
      expect(sheet.bins[0]?.lines[0]).not.toHaveProperty('systemQty');
      const lineA = sheet.bins[0]?.lines[0]?.id as string;

      const entered = await counts.enter(keeper, created.id, {
        version: sheet.version,
        lines: [{ lineId: lineA, countedQty: '7' }],
      });
      const found = await counts.addLine(keeper, created.id, {
        version: entered.version,
        binId: bin,
        itemId: itemB,
        countedQty: '2',
      });
      const submitted = await counts.submit(keeper, created.id, found.version);
      expect(submitted.status).toBe('SUBMITTED');

      const self = await failure(
        counts.approve(
          { ...manager, userId: keeper.userId },
          created.id,
          submitted.version,
        ),
      );
      expect(self.response?.code).toBe('SELF_APPROVAL');

      const posted = await counts.approve(
        manager,
        created.id,
        submitted.version,
      );
      expect(posted.status).toBe('POSTED');
      expect(
        posted.bins[0]?.lines.map((l) => [l.item.id, l.difference]),
      ).toEqual(
        expect.arrayContaining([
          [itemA, '-3'],
          [itemB, '2'],
        ]),
      );
      expect(await binQty(bin, itemA)).toBe('7');
      expect(await binQty(bin, itemB)).toBe('2');
      const ledger = await prisma.stockLedger.findMany({
        where: { docType: 'CNT', docId: created.id },
        select: { movement: true, qty: true },
      });
      expect(ledger.map((l) => [l.movement, qtyString(l.qty)]).sort()).toEqual([
        ['COUNT_ADJUST', '-3'],
        ['COUNT_ADJUST', '2'],
      ]);
      expect(
        (await prisma.bin.findUniqueOrThrow({ where: { id: bin } })).countId,
      ).toBeNull();
      await post(itemA, bin, '1');
    });

    it('refuses a shortfall that would break reserved stock', async () => {
      const bin = await newBin('C');
      await post(itemB, bin, '3');
      const count = await counts.create(manager, {
        kind: 'CYCLE',
        blind: false,
        zoneIds: [],
        binIds: [bin],
      });
      const line = count.bins[0]?.lines[0]?.id as string;
      const entered = await counts.enter(keeper, count.id, {
        version: count.version,
        lines: [{ lineId: line, countedQty: '0' }],
      });
      const submitted = await counts.submit(keeper, count.id, entered.version);
      const balance = await prisma.stockBalance.findFirstOrThrow({
        where: { storeId, itemId: itemB },
      });
      await prisma.$transaction((tx) =>
        engine.reserve(tx, {
          source: 'HOLD',
          sourceId: randomUUID(),
          sourceLineId: randomUUID(),
          itemId: itemB,
          qty: balance.onHand,
        }),
      );
      const error = await failure(
        counts.approve(manager, count.id, submitted.version),
      );
      expect(error.response?.code).toBe('INSUFFICIENT_STOCK');
      expect(error.response?.message).toContain(partB);
      expect((await counts.detail(manager, count.id)).status).toBe('SUBMITTED');
    });

    it('opens a bin once with an opening count', async () => {
      const bin = await newBin('D');
      const count = await counts.create(manager, {
        kind: 'OPENING',
        blind: false,
        zoneIds: [],
        binIds: [bin],
      });
      expect(count.bins).toEqual([
        expect.objectContaining({ id: bin, lineCount: 0 }),
      ]);
      const found = await counts.addLine(keeper, count.id, {
        version: count.version,
        binId: bin,
        itemId: itemA,
        countedQty: '6',
      });
      const submitted = await counts.submit(keeper, count.id, found.version);
      await counts.approve(manager, count.id, submitted.version);
      expect(await binQty(bin, itemA)).toBe('6');
      const opened = await prisma.bin.findUniqueOrThrow({ where: { id: bin } });
      expect(opened.openedAt).not.toBeNull();
      const ledger = await prisma.stockLedger.findMany({
        where: { docType: 'CNT', docId: count.id },
        select: { movement: true },
      });
      expect(ledger.map((l) => l.movement)).toEqual(['OPENING']);

      const again = await failure(
        counts.create(manager, {
          kind: 'OPENING',
          blind: false,
          zoneIds: [],
          binIds: [bin],
        }),
      );
      expect(again.response?.code).toBe('INVALID_INPUT');
      expect(again.response?.message).toContain('opening count');
    });

    it('agrees with the nightly reconciliation', async () => {
      const mismatches = await prisma.$transaction((tx) => findMismatches(tx));
      expect(
        mismatches.filter((m) => m.itemId === itemA || m.itemId === itemB),
      ).toEqual([]);
    });
  },
);
