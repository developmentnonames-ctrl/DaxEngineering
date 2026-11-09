import { randomBytes, randomUUID } from 'node:crypto';
import {
  AttachmentAccessRegistry,
  AuditService,
  EventBus,
  NumberingService,
  type RequestContext,
} from '@dax/platform-core';
import { PrismaService } from '@dax/platform-db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INVENTORY_ENTITIES } from '../entities';
import { MainStore } from '../main-store.service';
import { stockFigures } from '../stock-math';
import { findMismatches } from '../stock/reconcile';
import { StockPostingService } from '../stock/stock-posting.service';
import { fakePolicy } from '../testing';
import { AodsService } from './aods.service';
import { HoldsService } from './holds.service';
import { MrnsService } from './mrns.service';

const url = process.env['TEST_DATABASE_URL'];
const ACTOR = '00000000-0000-0000-0000-000000000001';

describe.skipIf(!url)('issuing against Postgres', { timeout: 60_000 }, () => {
  let prisma: PrismaService;
  let engine: StockPostingService;
  let holds: HoldsService;
  let mrns: MrnsService;
  let aods: AodsService;
  let departmentId: string;
  let customerId: string;
  let itemA: string;
  let itemB: string;
  let binA: string;
  let partA: string;
  const policy = fakePolicy([
    'inventory.hold.view',
    'inventory.mrn.view',
    'inventory.mrn.create',
    'inventory.aod.view',
  ]);

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
  const receive = (itemId: string, qty: string) =>
    prisma.$transaction((tx) =>
      engine.post(
        tx,
        [
          {
            itemId,
            binId: binA,
            qty,
            movement: 'RECEIVE',
            docType: 'TEST',
            docId: randomUUID(),
          },
        ],
        ACTOR,
      ),
    );
  const failure = async (promise: Promise<unknown>) => {
    try {
      await promise;
    } catch (error) {
      return error as { response?: { code?: string; message?: string } };
    }
    throw new Error('Expected a failure');
  };
  const readyMrn = async (itemId: string, qty: string) => {
    const draft = await mrns.create(policy, {
      subtype: 'PRT',
      departmentId,
      lines: [{ itemId, qty }],
    });
    const submitted = await mrns.submit(policy, draft.id, draft.version);
    return mrns.check(policy, draft.id, submitted.version);
  };

  beforeAll(async () => {
    prisma = new PrismaService({
      url: url as string,
      applicationName: 'dax-test',
    });
    const context = { get: () => ({}) } as unknown as RequestContext;
    const store = new MainStore(prisma);
    const audit = new AuditService(prisma, context, [...INVENTORY_ENTITIES]);
    const numbering = new NumberingService();
    engine = new StockPostingService(store, context);
    holds = new HoldsService(prisma, audit, numbering, engine);
    mrns = new MrnsService(prisma, audit, numbering, engine, store, []);
    aods = new AodsService(
      prisma,
      audit,
      numbering,
      new EventBus(),
      engine,
      store,
      mrns,
      new AttachmentAccessRegistry(),
    );
    const series: [string, string][] = [
      ['HLD', ''],
      ['MRN', 'PRT'],
      ['MRN', 'SRV'],
      ['AOD', 'SER'],
      ['AOD', 'DIR'],
    ];
    for (const [docType, subtype] of series) {
      await prisma.numberSeries.upsert({
        where: { docType_subtype: { docType, subtype } },
        create: {
          moduleKey: 'inventory',
          docType,
          subtype,
          name: `${docType} ${subtype}`,
          pattern: subtype ? '{DOC}/{SUB}/{FY}/{SEQ}' : '{DOC}/{FY}/{SEQ}',
        },
        update: {},
      });
    }

    const suffix = token().toUpperCase();
    departmentId = (
      await prisma.department.create({
        data: {
          key: `test_${suffix.toLowerCase()}`,
          name: `Service ${suffix}`,
        },
      })
    ).id;
    customerId = (
      await prisma.customer.create({
        data: {
          code: `CUS-T${suffix}`,
          name: `Test customer ${suffix}`,
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
        name: 'Issuing test zone',
      },
    });
    binA = (
      await prisma.bin.create({
        data: {
          storeId: storeRow.id,
          zoneId: zone.id,
          code: `${zone.code}-01-01-A`,
          rack: '01',
          shelf: '01',
          position: 'A',
          kind: 'STORAGE',
          qrToken: token(),
          createdBy: ACTOR,
          updatedBy: ACTOR,
        },
      })
    ).id;
    const brand = await prisma.brand.create({
      data: { name: `Issuing ${suffix}` },
    });
    const item = async (n: string) =>
      prisma.item.create({
        data: {
          partNo: `I${n}-${suffix}`,
          partNoNorm: `I${n}${suffix}`,
          brandId: brand.id,
          description: 'Issuing test part',
          uom: 'PCS',
          defaultBinId: binA,
          qrToken: token(),
          createdBy: ACTOR,
          updatedBy: ACTOR,
        },
      });
    const a = await item('A');
    itemA = a.id;
    partA = a.partNo;
    itemB = (await item('B')).id;
    await receive(itemA, '10');
    await receive(itemB, '2');
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('takes a hold through to a signed AOD and a closed request', async () => {
    const hold = await holds.create(policy, {
      departmentId,
      customerId,
      reason: 'Customer is collecting next week',
      lines: [{ itemId: itemA, qty: '4' }],
    });
    expect(hold.number).toMatch(/^HLD\/\d{2}\/\d{4}$/);
    expect(hold.customer?.id).toBe(customerId);
    expect(await figures(itemA)).toMatchObject({ held: '4', free: '6' });

    const tooMuch = await failure(
      holds.create(policy, {
        departmentId,
        lines: [{ itemId: itemA, qty: '7' }],
      }),
    );
    expect(tooMuch.response).toMatchObject({
      code: 'NOT_ENOUGH_FREE_STOCK',
      message: `Only 6 of ${partA} is free.`,
    });

    const mrn = await mrns.convertHold(policy, hold.id, {
      version: hold.version,
      subtype: 'SRV',
      jobNumber: 'J-100',
    });
    expect(mrn.status).toBe('READY');
    expect(mrn.number).toMatch(/^MRN\/SRV\/\d{2}\/\d{4}$/);
    expect(mrn.hold?.id).toBe(hold.id);
    expect(mrn.lines.map((l) => [l.qtyReserved, l.qtyWaiting])).toEqual([
      ['4', '0'],
    ]);
    expect((await holds.detail(policy, hold.id)).status).toBe('CONVERTED');
    expect(await figures(itemA)).toMatchObject({ held: '4', free: '6' });

    const aod = await aods.create(policy, {
      mrnId: mrn.id,
      type: 'SER',
      deliverTo: 'Site A',
    });
    expect(aod.lines.map((l) => [l.qty, l.bin?.id, l.reservedForLine])).toEqual(
      [['4', binA, '4']],
    );
    const issued = await aods.issue(policy, aod.id, aod.version);
    expect(issued.status).toBe('ISSUED');
    expect(issued.number).toMatch(/^AOD\/SER\/\d{2}\/\d{4}$/);
    expect(await figures(itemA)).toMatchObject({
      onHand: '6',
      held: '0',
      free: '6',
    });
    expect((await mrns.detail(policy, mrn.id)).status).toBe('ISSUED');

    const { pdf } = await aods.pdf(policy, aod.id);
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');

    const unsigned = await failure(
      aods.sign(policy, aod.id, {
        version: issued.version,
        attachmentId: randomUUID(),
      }),
    );
    expect(unsigned.response?.code).toBe('INVALID_INPUT');
    const file = await prisma.attachment.create({
      data: {
        moduleKey: 'inventory',
        entityKey: 'inventory.aod',
        entityId: aod.id,
        kind: 'signed_aod',
        fileName: 'signed.pdf',
        contentType: 'application/pdf',
        size: 10,
        sha256: 'x'.repeat(64),
        storageKey: `test/${randomUUID()}`,
        uploadedBy: ACTOR,
      },
    });
    const signed = await aods.sign(policy, aod.id, {
      version: issued.version,
      attachmentId: file.id,
    });
    expect(signed.status).toBe('SIGNED');
    expect(signed.signedFileId).toBe(file.id);
    expect((await mrns.detail(policy, mrn.id)).status).toBe('CLOSED');
  });

  it('reserves what is free, waits for the rest, and allocates new stock', async () => {
    const draft = await mrns.create(policy, {
      subtype: 'PRT',
      departmentId,
      customerId,
      lines: [{ itemId: itemB, qty: '5' }],
    });
    expect(draft.number).toBeNull();
    const submitted = await mrns.submit(policy, draft.id, draft.version);
    expect(submitted.number).toMatch(/^MRN\/PRT\//);
    const checked = await mrns.check(policy, draft.id, submitted.version);
    expect(checked.status).toBe('CHECKED');
    expect(checked.lines.map((l) => [l.qtyReserved, l.qtyWaiting])).toEqual([
      ['2', '3'],
    ]);
    expect(checked.waitingLines).toBe(1);
    const waiting = await mrns.list(policy, { status: 'WAITING', limit: 200 });
    expect(waiting.items.map((m) => m.id)).toContain(draft.id);

    await receive(itemB, '4');
    const allocated = await mrns.allocate(policy, draft.id, {
      version: checked.version,
    });
    expect(allocated.status).toBe('READY');
    expect(allocated.lines.map((l) => [l.qtyReserved, l.qtyWaiting])).toEqual([
      ['5', '0'],
    ]);
    expect(await figures(itemB)).toMatchObject({
      onHand: '6',
      held: '5',
      free: '1',
    });
  });

  it('releases reservations and cancels picking when closing short', async () => {
    const mrn = await readyMrn(itemA, '2');
    expect(mrn.status).toBe('READY');
    const aod = await aods.create(policy, { mrnId: mrn.id, type: 'DIR' });
    const before = await mrns.detail(policy, mrn.id);
    const closed = await mrns.shortClose(policy, mrn.id, {
      version: before.version,
      reason: 'Customer no longer needs it',
    });
    expect(closed.status).toBe('SHORT_CLOSED');
    expect(closed.closeReason).toBe('Customer no longer needs it');
    expect(closed.lines.map((l) => [l.qtyShortClosed, l.qtyReserved])).toEqual([
      ['2', '0'],
    ]);
    expect((await aods.detail(policy, aod.id)).status).toBe('CANCELLED');
    expect(await figures(itemA)).toMatchObject({ held: '0', free: '6' });
  });

  it('lets only one of two pickers issue the same reserved stock', async () => {
    const mrn = await readyMrn(itemA, '1');
    const aod = await aods.create(policy, { mrnId: mrn.id, type: 'SER' });
    const results = await Promise.allSettled([
      aods.issue(policy, aod.id, aod.version),
      aods.issue(policy, aod.id, aod.version),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected');
    expect(
      (rejected as PromiseRejectedResult | undefined)?.reason,
    ).toMatchObject({
      status: 409,
    });
    expect(await figures(itemA)).toMatchObject({ onHand: '5', held: '0' });
    const ledger = await prisma.stockLedger.findMany({
      where: { docType: 'AOD', docId: aod.id },
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
