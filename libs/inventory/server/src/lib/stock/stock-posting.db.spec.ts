import { randomBytes, randomUUID } from 'node:crypto';
import type { RequestContext } from '@dax/platform-core';
import { PrismaService } from '@dax/platform-db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MainStore } from '../main-store.service';
import { findMismatches } from './reconcile';
import { type Movement, StockPostingService } from './stock-posting.service';

const url = process.env['TEST_DATABASE_URL'];
const ACTOR = '00000000-0000-0000-0000-000000000001';

describe.skipIf(!url)('stock posting against Postgres', () => {
  let prisma: PrismaService;
  let engine: StockPostingService;
  let itemId: string;
  let receivingBin: string;
  let storageBin: string;
  const docId = randomUUID();

  const token = () => randomBytes(8).toString('hex').slice(0, 12);
  const move = (
    binId: string,
    qty: string,
    movement: Movement['movement'],
  ): Movement => ({ itemId, binId, qty, movement, docType: 'TEST', docId });
  const balance = () =>
    prisma.stockBalance.findFirstOrThrow({
      where: { itemId },
      select: { onHand: true, receiving: true, quarantine: true, held: true },
    });
  const binQty = async (binId: string) =>
    String(
      (
        await prisma.binStock.findUnique({
          where: { binId_itemId: { binId, itemId } },
        })
      )?.qty ?? 0,
    );

  beforeAll(async () => {
    prisma = new PrismaService({
      url: url as string,
      applicationName: 'dax-test',
    });
    const context = { get: () => ({}) } as unknown as RequestContext;
    engine = new StockPostingService(new MainStore(prisma), context);
    const store = await prisma.store.findUniqueOrThrow({
      where: { code: 'MAIN' },
    });
    const suffix = token().toUpperCase();
    const zone = await prisma.zone.create({
      data: {
        storeId: store.id,
        code: [...randomBytes(3)]
          .map((b) => String.fromCharCode(65 + (b % 26)))
          .join(''),
        name: 'Test zone',
      },
    });
    const bin = (kind: 'RECEIVING' | 'STORAGE', position: string) =>
      prisma.bin.create({
        data: {
          storeId: store.id,
          zoneId: zone.id,
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
      data: { name: `Test ${suffix}` },
    });
    itemId = (
      await prisma.item.create({
        data: {
          partNo: `T-${suffix}`,
          partNoNorm: `T${suffix}`,
          brandId: brand.id,
          description: 'Stock engine test part',
          uom: 'PCS',
          qrToken: token(),
          createdBy: ACTOR,
          updatedBy: ACTOR,
        },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('receives into the receiving bin without making stock free', async () => {
    await prisma.$transaction((tx) =>
      engine.post(tx, [move(receivingBin, '10', 'RECEIVE')], ACTOR),
    );
    const b = await balance();
    expect(String(b.onHand)).toBe('10');
    expect(String(b.receiving)).toBe('10');
    expect(await binQty(receivingBin)).toBe('10');
  });

  it('puts away stock, which then becomes free', async () => {
    await prisma.$transaction((tx) =>
      engine.post(
        tx,
        [
          move(receivingBin, '-6', 'PUTAWAY_OUT'),
          move(storageBin, '6', 'PUTAWAY_IN'),
        ],
        ACTOR,
      ),
    );
    const b = await balance();
    expect(String(b.onHand)).toBe('10');
    expect(String(b.receiving)).toBe('4');
    expect(await binQty(storageBin)).toBe('6');
  });

  it('refuses to take a bin below zero and changes nothing', async () => {
    await expect(
      prisma.$transaction((tx) =>
        engine.post(tx, [move(storageBin, '-20', 'PUTAWAY_OUT')], ACTOR),
      ),
    ).rejects.toMatchObject({ response: { code: 'INSUFFICIENT_STOCK' } });
    expect(await binQty(storageBin)).toBe('6');
    expect(String((await balance()).onHand)).toBe('10');
  });

  it('lets only one of two racing withdrawals for the same stock succeed', async () => {
    const take = () =>
      prisma.$transaction((tx) =>
        engine.post(tx, [move(storageBin, '-4', 'PUTAWAY_OUT')], ACTOR),
      );
    const results = await Promise.allSettled([take(), take()]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await binQty(storageBin)).toBe('2');
  });

  it('keeps the ledger append-only', async () => {
    await expect(
      prisma.$executeRaw`UPDATE inventory.stock_ledger SET qty = qty WHERE item_id = ${itemId}::uuid`,
    ).rejects.toThrow();
  });

  it('agrees with the nightly reconciliation', async () => {
    const mismatches = await prisma.$transaction((tx) => findMismatches(tx));
    expect(mismatches.filter((m) => m.itemId === itemId)).toEqual([]);
  });
});
