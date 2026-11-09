import { randomBytes, randomUUID } from 'node:crypto';
import { AuditService, EventBus, NumberingService } from '@dax/platform-core';
import type { RequestContext } from '@dax/platform-core';
import { PrismaService } from '@dax/platform-db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INVENTORY_ENTITIES } from '../entities';
import { LocationsService } from '../locations.service';
import { MainStore } from '../main-store.service';
import { stockFigures } from '../stock-math';
import { findMismatches } from '../stock/reconcile';
import { StockPostingService } from '../stock/stock-posting.service';
import { fakePolicy } from '../testing';
import { GrnsService } from './grns.service';
import { PutawayService } from './putaway.service';

const url = process.env['TEST_DATABASE_URL'];
const ACTOR = '00000000-0000-0000-0000-000000000001';

describe.skipIf(!url)('receiving against Postgres', { timeout: 30_000 }, () => {
  let prisma: PrismaService;
  let engine: StockPostingService;
  let grns: GrnsService;
  let putaway: PutawayService;
  let supplierId: string;
  let itemA: string;
  let itemB: string;
  let storageBin: string;
  let firstGrn: string;
  const policy = fakePolicy();

  const token = () => randomBytes(8).toString('hex').slice(0, 12);
  const letters = (n: number) =>
    [...randomBytes(n)].map((b) => String.fromCharCode(65 + (b % 26))).join('');
  const figures = async (itemId: string) =>
    stockFigures(
      await prisma.stockBalance.findFirst({
        where: { itemId },
        select: { onHand: true, held: true, quarantine: true, receiving: true },
      }),
    ).figures;
  const failure = async (promise: Promise<unknown>) => {
    try {
      await promise;
    } catch (error) {
      return error as { response?: { code?: string } };
    }
    throw new Error('Expected a failure');
  };
  const walkInPosted = async (qtyGood: string, qtyDamaged = '0') => {
    const draft = await grns.create(policy, { supplierId });
    const edited = await grns.update(policy, draft.id, {
      version: draft.version,
      lines: [{ itemId: itemA, qtyGood, qtyDamaged, wrongItem: false }],
    });
    const checked = await grns.check(policy, draft.id, edited.version);
    return grns.post(policy, draft.id, checked.version);
  };

  beforeAll(async () => {
    prisma = new PrismaService({
      url: url as string,
      applicationName: 'dax-test',
    });
    const context = { get: () => ({}) } as unknown as RequestContext;
    const store = new MainStore(prisma);
    const audit = new AuditService(prisma, context, [...INVENTORY_ENTITIES]);
    engine = new StockPostingService(store, context);
    grns = new GrnsService(
      prisma,
      audit,
      new NumberingService(),
      new EventBus(),
      engine,
      store,
    );
    putaway = new PutawayService(prisma, audit, new EventBus(), engine, store);
    await new LocationsService(prisma, audit, store).ensureSpecialAreas();
    for (const subtype of ['FOR', 'LOC']) {
      await prisma.numberSeries.upsert({
        where: { docType_subtype: { docType: 'GRN', subtype } },
        create: {
          moduleKey: 'inventory',
          docType: 'GRN',
          subtype,
          name: `Goods received note ${subtype}`,
        },
        update: {},
      });
    }

    const suffix = token().toUpperCase();
    supplierId = (
      await prisma.supplier.create({
        data: {
          code: `SUP-T${suffix}`,
          name: `Test supplier ${suffix}`,
          isForeign: true,
          createdBy: ACTOR,
          updatedBy: ACTOR,
        },
      })
    ).id;
    const storeRow = await prisma.store.findUniqueOrThrow({
      where: { code: 'MAIN' },
    });
    const zone = await prisma.zone.create({
      data: {
        storeId: storeRow.id,
        code: letters(3),
        name: 'Receiving test zone',
      },
    });
    storageBin = (
      await prisma.bin.create({
        data: {
          storeId: storeRow.id,
          zoneId: zone.id,
          code: `${zone.code}-01-01-BIN`,
          rack: '01',
          shelf: '01',
          position: 'BIN',
          kind: 'STORAGE',
          qrToken: token(),
          createdBy: ACTOR,
          updatedBy: ACTOR,
        },
      })
    ).id;
    const brand = await prisma.brand.create({
      data: { name: `Receiving ${suffix}` },
    });
    const item = (n: string) =>
      prisma.item.create({
        data: {
          partNo: `R${n}-${suffix}`,
          partNoNorm: `R${n}${suffix}`,
          brandId: brand.id,
          description: 'Receiving test part',
          uom: 'PCS',
          qrToken: token(),
          createdBy: ACTOR,
          updatedBy: ACTOR,
        },
      });
    itemA = (await item('A')).id;
    itemB = (await item('B')).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('receives a delivery with shortage, excess and damage', async () => {
    const draft = await grns.create(policy, {
      supplierId,
      deliveryNote: 'DN-1',
      deliveryDate: '2026-11-01',
    });
    firstGrn = draft.id;
    expect(draft.subtype).toBe('FOR');
    expect(draft.number).toBeNull();
    expect(draft.lines).toEqual([]);

    const added = await grns.update(policy, draft.id, {
      version: draft.version,
      lines: [
        {
          itemId: itemA,
          qtyExpected: '10',
          qtyGood: '10',
          qtyDamaged: '0',
          wrongItem: false,
        },
        {
          itemId: itemB,
          qtyExpected: '4',
          qtyGood: '4',
          qtyDamaged: '0',
          wrongItem: false,
        },
      ],
    });
    const [lineA, lineB] = added.lines;
    if (!lineA || !lineB) throw new Error('Expected two lines');
    expect(added.lines.map((l) => [l.qtyExpected, l.qtyGood])).toEqual([
      ['10', '10'],
      ['4', '4'],
    ]);
    const edited = await grns.update(policy, draft.id, {
      version: added.version,
      lines: [
        {
          id: lineA.id,
          itemId: itemA,
          qtyGood: '8',
          qtyDamaged: '1',
          wrongItem: false,
        },
        {
          id: lineB.id,
          itemId: itemB,
          qtyGood: '5',
          qtyDamaged: '0',
          wrongItem: false,
        },
      ],
    });
    expect(edited.lines.map((l) => [l.id, l.qtyExpected])).toEqual([
      [lineA.id, '10'],
      [lineB.id, '4'],
    ]);
    const checked = await grns.check(policy, draft.id, edited.version);
    expect(checked.status).toBe('CHECKED');
    expect(checked.checked).not.toBeNull();

    const posted = await grns.post(policy, draft.id, checked.version);
    expect(posted.status).toBe('POSTED');
    expect(posted.number).toMatch(/^GRN\/FOR\/\d{2}\/\d{4}$/);
    expect(
      posted.discrepancies
        .map((d) => `${d.itemId === itemA ? 'A' : 'B'} ${d.kind} ${d.qty}`)
        .sort(),
    ).toEqual(['A DAMAGED 1', 'A SHORT 1', 'B EXCESS 1']);
    expect(await figures(itemA)).toMatchObject({
      onHand: '9',
      receiving: '8',
      quarantine: '1',
      free: '0',
    });
    expect(await figures(itemB)).toMatchObject({ onHand: '5', free: '0' });
  });

  it('puts stock away in parts and frees it', async () => {
    const grn = await grns.detail(firstGrn);
    const [lineA, lineB] = grn.lines;
    if (!lineA || !lineB) throw new Error('Expected two lines');
    const rows = (await putaway.list()).rows.filter(
      (r) => r.grn.id === firstGrn,
    );
    expect(rows.map((r) => r.toPutAway)).toEqual(['8', '5']);

    await putaway.putAway(policy, {
      moves: [{ grnLineId: lineA.id, binId: storageBin, qty: '5' }],
    });
    expect((await grns.detail(firstGrn)).status).toBe('POSTED');
    expect(await figures(itemA)).toMatchObject({ receiving: '3', free: '5' });

    const tooMuch = await failure(
      putaway.putAway(policy, {
        moves: [{ grnLineId: lineA.id, binId: storageBin, qty: '4' }],
      }),
    );
    expect(tooMuch.response?.code).toBe('PUTAWAY_TOO_MUCH');

    await putaway.putAway(policy, {
      moves: [
        { grnLineId: lineA.id, binId: storageBin, qty: '3' },
        { grnLineId: lineB.id, binId: storageBin, qty: '5' },
      ],
    });
    const done = await grns.detail(firstGrn);
    expect(done.status).toBe('PUT_AWAY');
    expect(done.lines.map((l) => l.toPutAway)).toEqual(['0', '0']);
    expect(await figures(itemA)).toMatchObject({
      onHand: '9',
      receiving: '0',
      quarantine: '1',
      free: '8',
    });
    expect(await figures(itemB)).toMatchObject({ free: '5' });
  });

  it('refuses to reverse a GRN whose stock has been used', async () => {
    await prisma.$transaction((tx) =>
      engine.post(
        tx,
        [
          {
            itemId: itemA,
            binId: storageBin,
            qty: '-2',
            movement: 'PUTAWAY_OUT',
            docType: 'TEST',
            docId: randomUUID(),
          },
        ],
        ACTOR,
      ),
    );
    const grn = await grns.detail(firstGrn);
    const error = await failure(
      grns.reverse(policy, firstGrn, {
        version: grn.version,
        reason: 'Sent to the wrong store',
      }),
    );
    expect(error.response?.code).toBe('GRN_STOCK_USED');
    const unchanged = await grns.detail(firstGrn);
    expect(unchanged.status).toBe('PUT_AWAY');
    expect(unchanged.version).toBe(grn.version);
  });

  it('reverses an untouched GRN and closes its discrepancies', async () => {
    const before = await figures(itemA);
    const posted = await walkInPosted('3', '1');
    expect(posted.subtype).toBe('FOR');
    expect(posted.discrepancies.map((d) => d.kind)).toEqual(['DAMAGED']);
    const reversed = await grns.reverse(policy, posted.id, {
      version: posted.version,
      reason: 'Delivered to us by mistake',
    });
    expect(reversed.status).toBe('REVERSED');
    expect(reversed.reversed?.reason).toBe('Delivered to us by mistake');
    expect(reversed.discrepancies.map((d) => d.status)).toEqual(['CLOSED']);
    expect(await figures(itemA)).toEqual(before);
    const ledger = await prisma.stockLedger.findMany({
      where: { docType: 'GRN', docId: posted.id },
    });
    expect(ledger.filter((l) => l.movement === 'REVERSAL')).toHaveLength(2);
  });

  it('lets only one of two racing posts of the same GRN succeed', async () => {
    const draft = await grns.create(policy, { supplierId });
    const edited = await grns.update(policy, draft.id, {
      version: draft.version,
      lines: [
        { itemId: itemB, qtyGood: '2', qtyDamaged: '0', wrongItem: false },
      ],
    });
    const checked = await grns.check(policy, draft.id, edited.version);
    const results = await Promise.allSettled([
      grns.post(policy, draft.id, checked.version),
      grns.post(policy, draft.id, checked.version),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected');
    expect(
      (rejected as PromiseRejectedResult | undefined)?.reason,
    ).toMatchObject({ response: { code: 'STALE' } });
    const ledger = await prisma.stockLedger.findMany({
      where: { docType: 'GRN', docId: draft.id },
    });
    expect(ledger).toHaveLength(1);
  });

  it('agrees with the nightly reconciliation', async () => {
    const mismatches = await prisma.$transaction((tx) => findMismatches(tx));
    expect(
      mismatches.filter((m) => m.itemId === itemA || m.itemId === itemB),
    ).toEqual([]);
  });
});
