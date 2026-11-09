import { randomBytes, randomUUID } from 'node:crypto';
import type { RequestContext } from '@dax/platform-core';
import { PrismaService } from '@dax/platform-db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MainStore } from '../main-store.service';
import { findMismatches } from './reconcile';
import { StockPostingService } from './stock-posting.service';

const url = process.env['TEST_DATABASE_URL'];
const ACTOR = '00000000-0000-0000-0000-000000000001';

describe.skipIf(!url)(
  'reservations against Postgres',
  { timeout: 30_000 },
  () => {
    let prisma: PrismaService;
    let engine: StockPostingService;
    let itemId: string;
    let bin: string;
    let emptyBin: string;
    const holdId = randomUUID();
    const holdLine = randomUUID();
    const mrnId = randomUUID();
    const mrnLine = randomUUID();

    const token = () => randomBytes(8).toString('hex').slice(0, 12);
    const letters = (n: number) =>
      [...randomBytes(n)]
        .map((b) => String.fromCharCode(65 + (b % 26)))
        .join('');
    const balance = async () => {
      const b = await prisma.stockBalance.findFirstOrThrow({
        where: { itemId },
        select: { onHand: true, held: true },
      });
      return { onHand: String(b.onHand), held: String(b.held) };
    };
    const failure = async (promise: Promise<unknown>) => {
      try {
        await promise;
      } catch (error) {
        return error as { response?: { code?: string } };
      }
      throw new Error('Expected a failure');
    };

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
      const zone = await prisma.zone.create({
        data: {
          storeId: store.id,
          code: letters(3),
          name: 'Reservation test zone',
        },
      });
      const makeBin = async (position: string) =>
        (
          await prisma.bin.create({
            data: {
              storeId: store.id,
              zoneId: zone.id,
              code: `${zone.code}-01-01-${position}`,
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
      bin = await makeBin('A');
      emptyBin = await makeBin('B');
      const suffix = token().toUpperCase();
      const brand = await prisma.brand.create({
        data: { name: `Reserve ${suffix}` },
      });
      itemId = (
        await prisma.item.create({
          data: {
            partNo: `RS-${suffix}`,
            partNoNorm: `RS${suffix}`,
            brandId: brand.id,
            description: 'Reservation test part',
            uom: 'PCS',
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
              binId: bin,
              qty: '10',
              movement: 'RECEIVE',
              docType: 'TEST',
              docId: randomUUID(),
            },
          ],
          ACTOR,
        ),
      );
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    it('reserves free stock and refuses more than is free', async () => {
      await prisma.$transaction((tx) =>
        engine.reserve(tx, {
          source: 'HOLD',
          sourceId: holdId,
          sourceLineId: holdLine,
          itemId,
          qty: '6',
        }),
      );
      expect(await balance()).toEqual({ onHand: '10', held: '6' });
      expect(
        String(await prisma.$transaction((tx) => engine.freeQty(tx, itemId))),
      ).toBe('4');

      const error = await failure(
        prisma.$transaction((tx) =>
          engine.reserve(tx, {
            source: 'MRN',
            sourceId: mrnId,
            sourceLineId: randomUUID(),
            itemId,
            qty: '4.001',
          }),
        ),
      );
      expect(error.response?.code).toBe('NOT_ENOUGH_FREE_STOCK');
      expect(await balance()).toEqual({ onHand: '10', held: '6' });
    });

    it('releases part and moves the rest from a hold to a request', async () => {
      const released = await prisma.$transaction((tx) =>
        engine.release(tx, 'HOLD', holdLine, '1'),
      );
      expect(String(released)).toBe('1');
      await prisma.$transaction((tx) =>
        engine.transfer(
          tx,
          { source: 'HOLD', sourceLineId: holdLine },
          { source: 'MRN', sourceId: mrnId, sourceLineId: mrnLine },
        ),
      );
      expect(await balance()).toEqual({ onHand: '10', held: '5' });
      const [onHold, onMrn] = await prisma.$transaction(async (tx) => [
        await engine.reservedQty(tx, 'HOLD', holdLine),
        await engine.reservedQty(tx, 'MRN', mrnLine),
      ]);
      expect([String(onHold), String(onMrn)]).toEqual(['0', '5']);
    });

    it('issues reserved stock, lowering on hand and held together', async () => {
      const issue = (qty: string, binId = bin) =>
        prisma.$transaction((tx) =>
          engine.issueReserved(
            tx,
            {
              itemId,
              binId,
              qty,
              mrnLineId: mrnLine,
              docType: 'AOD',
              docId: mrnId,
              docLineId: randomUUID(),
            },
            ACTOR,
          ),
        );
      const posted = await issue('2');
      expect(posted[0]?.binQtyAfter).toBe('8');
      expect(await balance()).toEqual({ onHand: '8', held: '3' });

      expect((await failure(issue('3.5'))).response?.code).toBe('NOT_RESERVED');
      expect((await failure(issue('1', emptyBin))).response?.code).toBe(
        'INSUFFICIENT_STOCK',
      );
      expect(await balance()).toEqual({ onHand: '8', held: '3' });

      const ledger = await prisma.stockLedger.findMany({
        where: { itemId, movement: 'ISSUE' },
      });
      expect(ledger.map((l) => String(l.qty))).toEqual(['-2']);
    });

    it('releases everything that is left', async () => {
      const released = await prisma.$transaction((tx) =>
        engine.release(tx, 'MRN', mrnLine),
      );
      expect(String(released)).toBe('3');
      expect(await balance()).toEqual({ onHand: '8', held: '0' });
      expect(
        await prisma.reservation.count({ where: { sourceLineId: mrnLine } }),
      ).toBe(0);
    });

    it('agrees with the nightly reconciliation', async () => {
      const mismatches = await prisma.$transaction((tx) => findMismatches(tx));
      expect(mismatches.filter((m) => m.itemId === itemId)).toEqual([]);
    });
  },
);
