import { randomBytes, randomUUID } from 'node:crypto';
import type { RequestContext } from '@dax/platform-core';
import { PrismaService } from '@dax/platform-db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MainStore } from '../main-store.service';
import {
  type Movement,
  StockPostingService,
} from '../stock/stock-posting.service';
import { ReportsService } from './reports.service';

const url = process.env['TEST_DATABASE_URL'];
const ACTOR = '00000000-0000-0000-0000-000000000001';

describe.skipIf(!url)('stores reports against Postgres', () => {
  let prisma: PrismaService;
  let engine: StockPostingService;
  let reports: ReportsService;
  let storeId: string;
  let zoneId: string;
  let itemId: string;
  let partNo: string;
  let receivingBin: string;
  let storageBin: string;
  const docId = randomUUID();

  const token = () => randomBytes(8).toString('hex').slice(0, 12);
  const move = (
    binId: string,
    qty: string,
    movement: Movement['movement'],
  ): Movement => ({
    itemId,
    binId,
    qty,
    movement,
    docType: 'GRN',
    docId,
    docNumber: 'GRN/TEST/1',
  });
  const post = (moves: Movement[]) =>
    prisma.$transaction((tx) => engine.post(tx, moves, ACTOR));

  beforeAll(async () => {
    prisma = new PrismaService({
      url: url as string,
      applicationName: 'dax-test',
    });
    const context = { get: () => ({}) } as unknown as RequestContext;
    const store = new MainStore(prisma);
    engine = new StockPostingService(store, context);
    reports = new ReportsService(prisma, store);
    storeId = await store.id();
    const suffix = token().toUpperCase();
    const zone = await prisma.zone.create({
      data: {
        storeId,
        code: [...randomBytes(3)]
          .map((b) => String.fromCharCode(65 + (b % 26)))
          .join(''),
        name: 'Report zone',
      },
    });
    zoneId = zone.id;
    const bin = (kind: 'RECEIVING' | 'STORAGE', position: string) =>
      prisma.bin.create({
        data: {
          storeId,
          zoneId,
          code: `${zone.code}-01-01-${position}`,
          rack: '01',
          shelf: '01',
          position,
          kind,
          qrToken: token(),
          createdBy: ACTOR,
          updatedBy: ACTOR,
        },
      });
    receivingBin = (await bin('RECEIVING', 'R')).id;
    storageBin = (await bin('STORAGE', 'S')).id;
    const brand = await prisma.brand.create({
      data: { name: `Report ${suffix}` },
    });
    partNo = `R-${suffix}`;
    itemId = (
      await prisma.item.create({
        data: {
          partNo,
          partNoNorm: `R${suffix}`,
          brandId: brand.id,
          description: 'Report test part',
          uom: 'PCS',
          minQty: '10',
          qrToken: token(),
          createdBy: ACTOR,
          updatedBy: ACTOR,
        },
      })
    ).id;
    await post([move(receivingBin, '6', 'RECEIVE')]);
    await post([
      move(receivingBin, '-4', 'PUTAWAY_OUT'),
      move(storageBin, '4', 'PUTAWAY_IN'),
    ]);
    const mrn = await prisma.mrn.create({
      data: {
        number: `MRN/T/${randomUUID().slice(0, 8)}`,
        subtype: 'PRT',
        status: 'CHECKED',
        departmentId: randomUUID(),
        departmentName: 'Workshop',
        createdBy: ACTOR,
        updatedBy: ACTOR,
        lines: {
          create: { lineNo: 1, itemId, qtyRequested: '5', qtyIssued: '1' },
        },
      },
      include: { lines: true },
    });
    const line = mrn.lines[0];
    if (!line) throw new Error('MRN line missing');
    await prisma.reservation.create({
      data: {
        storeId,
        itemId,
        source: 'MRN',
        sourceId: mrn.id,
        sourceLineId: line.id,
        qty: '1',
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('lists the part below minimum with short-by and waiting quantities', async () => {
    const report = await reports.belowMin();
    const row = report.items.find((r) => r.item.id === itemId);
    expect(row).toMatchObject({
      minQty: '10',
      onHand: '6',
      free: '4',
      shortBy: '6',
      waiting: '3',
    });
  });

  it('lists movements newest first and filters them', async () => {
    const page = await reports.movements({ itemId, limit: 2 });
    expect(page.items.map((r) => `${r.movement} ${r.qty}`).sort()).toEqual([
      'PUTAWAY_IN 4',
      'PUTAWAY_OUT -4',
    ]);
    expect(page.nextCursor).not.toBeNull();
    expect(page.filterItem?.label).toContain(partNo);
    const rest = await reports.movements({
      itemId,
      limit: 2,
      cursor: page.nextCursor ?? undefined,
    });
    expect(rest.items.map((r) => r.movement)).toEqual(['RECEIVE']);
    const received = await reports.movements({
      itemId,
      movement: 'RECEIVE',
      limit: 50,
    });
    expect(received.items).toHaveLength(1);
    expect(received.items[0]?.docNumber).toBe('GRN/TEST/1');
    const past = await reports.movements({
      itemId,
      from: '2020-01-01',
      to: '2020-01-31',
      limit: 50,
    });
    expect(past.items).toEqual([]);
  });

  it('exports movements as CSV', async () => {
    const file = await reports.movementsCsv({ itemId, limit: 50 });
    const lines = file.text.trim().split('\r\n');
    expect(lines[0]).toContain('Date and time,Movement,Part number');
    expect(lines).toHaveLength(4);
    expect(file.name).toMatch(/^stock-movements-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  it('shows stock by bin for the zone', async () => {
    const report = await reports.stockByBin({ zoneId });
    expect(
      report.bins.map((b) => [b.id, b.beingCounted, b.lines.map((l) => l.qty)]),
    ).toEqual([
      [receivingBin, false, ['2']],
      [storageBin, false, ['4']],
    ]);
    const storage = await reports.stockByBin({ zoneId, kind: 'STORAGE' });
    expect(storage.bins.map((b) => b.id)).toEqual([storageBin]);
  });

  it('counts a part never issued as slow-moving until it is issued', async () => {
    const before = await reports.slowMoving({ days: '30' });
    expect(before.items.find((r) => r.item.id === itemId)).toMatchObject({
      onHand: '6',
      lastIssuedAt: null,
      daysSinceIssue: null,
    });
    await post([
      {
        itemId,
        binId: storageBin,
        qty: '-1',
        movement: 'ISSUE',
        docType: 'AOD',
        docId: randomUUID(),
      },
    ]);
    const after = await reports.slowMoving({ days: '30' });
    expect(after.items.some((r) => r.item.id === itemId)).toBe(false);
  });
});
