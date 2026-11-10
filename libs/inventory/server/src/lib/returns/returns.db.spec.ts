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
import { AodsService } from '../issuing/aods.service';
import { MrnsService } from '../issuing/mrns.service';
import { LocationsService } from '../locations.service';
import { MainStore } from '../main-store.service';
import { stockFigures } from '../stock-math';
import { findMismatches } from '../stock/reconcile';
import { StockPostingService } from '../stock/stock-posting.service';
import { fakePolicy } from '../testing';
import { WarrantyService } from '../warranty/warranty.service';
import { ReturnsService } from './returns.service';

const url = process.env['TEST_DATABASE_URL'];
const ACTOR = '00000000-0000-0000-0000-000000000001';

describe.skipIf(!url)('returns against Postgres', { timeout: 60_000 }, () => {
  let prisma: PrismaService;
  let engine: StockPostingService;
  let mrns: MrnsService;
  let aods: AodsService;
  let returns: ReturnsService;
  let departmentId: string;
  let itemId: string;
  let binA: string;
  let quarantineBin: string;
  let aodId: string;
  let aodLineId: string;
  const policy = fakePolicy([
    'inventory.mrn.view',
    'inventory.aod.view',
    'inventory.return_note.view',
    'inventory.return_note.create',
    'inventory.return_note.post',
  ]);

  const token = () => randomBytes(8).toString('hex').slice(0, 12);
  const letters = (n: number) =>
    [...randomBytes(n)].map((b) => String.fromCharCode(65 + (b % 26))).join('');
  const figures = async () =>
    stockFigures(
      await prisma.stockBalance.findFirst({
        where: { itemId },
        select: { onHand: true, held: true, quarantine: true, receiving: true },
      }),
    ).figures;
  const inBin = async (binId: string) =>
    (
      await prisma.binStock.findFirst({
        where: { binId, itemId },
        select: { qty: true },
      })
    )?.qty.toFixed() ?? '0';
  const failure = async (promise: Promise<unknown>) => {
    try {
      await promise;
    } catch (error) {
      return error as { response?: { code?: string; message?: string } };
    }
    throw new Error('Expected a failure');
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
    const warranty = new WarrantyService(
      prisma,
      audit,
      numbering,
      store,
      new AttachmentAccessRegistry(),
    );
    returns = new ReturnsService(
      prisma,
      audit,
      numbering,
      engine,
      store,
      warranty,
    );
    await new LocationsService(prisma, audit, store).ensureSpecialAreas();
    const series: [string, string][] = [
      ['MRN', 'PRT'],
      ['AOD', 'SER'],
      ['RTN', ''],
      ['WTY', ''],
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
          name: `Workshop ${suffix}`,
        },
      })
    ).id;
    const storeRow = await prisma.store.findUniqueOrThrow({
      where: { code: 'MAIN' },
    });
    quarantineBin = (
      await prisma.bin.findFirstOrThrow({
        where: { storeId: storeRow.id, code: { endsWith: '-QUA' } },
        select: { id: true },
      })
    ).id;
    const zone = await prisma.zone.create({
      data: {
        storeId: storeRow.id,
        code: letters(3),
        name: 'Returns test zone',
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
      data: { name: `Returns ${suffix}` },
    });
    itemId = (
      await prisma.item.create({
        data: {
          partNo: `R-${suffix}`,
          partNoNorm: `R${suffix}`,
          brandId: brand.id,
          description: 'Returns test part',
          uom: 'PCS',
          defaultBinId: binA,
          qrToken: token(),
          createdBy: ACTOR,
          updatedBy: ACTOR,
        },
      })
    ).id;
    await prisma.$transaction((tx) =>
      engine.post(
        tx,
        [
          {
            itemId,
            binId: binA,
            qty: '10',
            movement: 'RECEIVE',
            docType: 'TEST',
            docId: randomUUID(),
          },
        ],
        ACTOR,
      ),
    );

    const draft = await mrns.create(policy, {
      subtype: 'PRT',
      departmentId,
      jobNumber: 'J-RTN',
      lines: [{ itemId, qty: '5' }],
    });
    const submitted = await mrns.submit(policy, draft.id, draft.version);
    await mrns.check(policy, draft.id, submitted.version);
    const aod = await aods.create(policy, { mrnId: draft.id, type: 'SER' });
    await aods.issue(policy, aod.id, aod.version);
    aodId = aod.id;
    aodLineId = aod.lines[0]?.id as string;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('posts good stock to its bin, damaged to quarantine and tags faulty parts', async () => {
    expect(await figures()).toMatchObject({ onHand: '5', quarantine: '0' });
    const draft = await returns.create(policy, {
      aodId,
      lines: [
        { aodLineId, itemId, qty: '2', condition: 'GOOD', binId: binA },
        { aodLineId, itemId, qty: '1', condition: 'DAMAGED' },
        {
          aodLineId,
          itemId,
          qty: '1',
          condition: 'FAULTY',
          serialNo: 'SN-9',
          notes: 'Burnt coil',
        },
      ],
    });
    expect(draft.number).toBeNull();
    expect(draft.department.id).toBe(departmentId);
    expect(draft.jobNumber).toBe('J-RTN');
    expect(draft.lines.map((l) => l.bin?.id ?? null)).toEqual([
      binA,
      quarantineBin,
      null,
    ]);

    const posted = await returns.post(policy, draft.id, draft.version);
    expect(posted.status).toBe('POSTED');
    expect(posted.number).toMatch(/^RTN\/\d{2}\/\d{4}$/);
    expect(await figures()).toMatchObject({
      onHand: '8',
      quarantine: '1',
      free: '7',
    });
    expect(await inBin(binA)).toBe('7');
    expect(await inBin(quarantineBin)).toBe('1');

    const ledger = await prisma.stockLedger.findMany({
      where: { docType: 'RTN', docId: draft.id },
      select: { movement: true, qty: true, docNumber: true },
    });
    expect(ledger).toHaveLength(2);
    expect(ledger.every((l) => l.movement === 'RETURN')).toBe(true);
    expect(ledger.every((l) => l.docNumber === posted.number)).toBe(true);

    const faulty = posted.lines.find((l) => l.condition === 'FAULTY');
    expect(faulty?.warrantyTag?.number).toMatch(/^WTY\//);
    const tag = await prisma.warrantyTag.findUniqueOrThrow({
      where: { id: faulty?.warrantyTag?.id as string },
    });
    expect(tag).toMatchObject({
      returnLineId: faulty?.id,
      serialNo: 'SN-9',
      fault: 'Burnt coil',
      jobNumber: 'J-RTN',
    });

    const left = await returns.returnable(policy, aodId);
    expect(left.lines.map((l) => [l.issued, l.returned, l.returnable])).toEqual(
      [['5', '4', '1']],
    );
  });

  it('lets only one of two returns take the last returnable unit', async () => {
    const make = () =>
      returns.create(policy, {
        aodId,
        lines: [
          { aodLineId, itemId, qty: '1', condition: 'GOOD', binId: binA },
        ],
      });
    const first = await make();
    const second = await make();
    const results = await Promise.allSettled([
      returns.post(policy, first.id, first.version),
      returns.post(policy, second.id, second.version),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected');
    expect(
      (rejected as PromiseRejectedResult | undefined)?.reason,
    ).toMatchObject({ response: { code: 'OVER_RETURN' } });
    expect(await inBin(binA)).toBe('8');

    const tooMuch = await failure(make());
    expect(tooMuch.response?.code).toBe('OVER_RETURN');
  });

  it('takes a free return with a reason and cancels drafts', async () => {
    const noReason = await failure(
      returns.create(policy, {
        departmentId,
        reason: 'no',
        lines: [{ itemId, qty: '1', condition: 'GOOD', binId: binA }],
      }),
    );
    expect(noReason.response?.code).toBe('INVALID_INPUT');

    const draft = await returns.create(policy, {
      departmentId,
      reason: 'Spare left after the service',
      lines: [{ itemId, qty: '1', condition: 'GOOD', binId: binA }],
    });
    const posted = await returns.post(policy, draft.id, draft.version);
    expect(posted.aod).toBeNull();
    expect(await inBin(binA)).toBe('9');

    const other = await returns.create(policy, {
      departmentId,
      reason: 'Found on the workshop floor',
      lines: [{ itemId, qty: '1', condition: 'DAMAGED' }],
    });
    const cancelled = await returns.cancel(policy, other.id, other.version);
    expect(cancelled.status).toBe('CANCELLED');
    const late = await failure(
      returns.post(policy, other.id, cancelled.version),
    );
    expect(late.response?.code).toBe('INVALID_STATE');
  });

  it('agrees with the nightly reconciliation', async () => {
    const mismatches = await prisma.$transaction((tx) => findMismatches(tx));
    expect(mismatches.filter((m) => m.itemId === itemId)).toEqual([]);
  });
});
