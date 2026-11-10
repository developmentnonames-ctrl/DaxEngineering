import { ConflictException, type HttpException } from '@nestjs/common';
import type { GrnDto } from '@dax/inventory-contract';
import type { EventBus, NumberingService } from '@dax/platform-core';
import { Prisma } from '@dax/platform-db';
import type { StockPostingService } from '../stock/stock-posting.service';
import { insufficient } from '../stock/stock-posting.service';
import {
  asPrisma,
  fakeAudit,
  fakePolicy,
  fakeStore,
  STORE_ID,
} from '../testing';
import { GrnsService } from './grns.service';
import { PutawayService } from './putaway.service';

const GRN = '0190a000-0000-7000-8000-000000000201';
const LINE = '0190a000-0000-7000-8000-000000000301';
const ITEM = '0190a000-0000-7000-8000-000000000101';
const BIN = '0190a000-0000-7000-8000-000000000401';
const RCV = '0190a000-0000-7000-8000-000000000402';
const QUA = '0190a000-0000-7000-8000-000000000403';
const WTY = '0190a000-0000-7000-8000-000000000404';

const policy = fakePolicy(['inventory.grn.check', 'inventory.grn.post']);

async function failure(promise: Promise<unknown>): Promise<HttpException> {
  try {
    await promise;
  } catch (error) {
    return error as HttpException;
  }
  throw new Error('Expected a failure');
}

const codeOf = (error: HttpException) =>
  (error.getResponse() as { code?: string }).code;

const specialBinRows = async () => [
  { id: RCV, code: 'X-00-00-RCV' },
  { id: QUA, code: 'X-00-00-QUA' },
  { id: WTY, code: 'X-00-00-WTY' },
];

interface FakeOptions {
  status?: string;
  version?: number;
  claimCount?: number;
  lines?: object[];
  ledger?: object[];
  stockPost?: () => Promise<unknown>;
}

function grns(options: FakeOptions = {}) {
  const claims: { where: unknown; data: Record<string, unknown> }[] = [];
  const lines = options.lines ?? [];
  const tx = {
    grn: {
      updateMany: async (args: {
        where: unknown;
        data: Record<string, unknown>;
      }) => {
        claims.push(args);
        return { count: options.claimCount ?? 1 };
      },
      findUniqueOrThrow: async () => ({
        number: 'GRN/LOC/26/0001',
        subtype: 'LOC',
        supplierId: ITEM,
        lines,
      }),
      update: async () => ({}),
    },
    grnLine: {
      deleteMany: async () => ({}),
      update: async () => ({}),
      createMany: async () => ({}),
    },
    stockLedger: { findMany: async () => options.ledger ?? [] },
    discrepancy: {
      updateMany: async () => ({ count: 0 }),
      createMany: async () => ({}),
    },
    $executeRaw: async () => 0,
  };
  const prisma = asPrisma({
    grn: {
      findUnique: async () => ({
        status: options.status ?? 'DRAFT',
        version: options.version ?? 3,
        subtype: 'LOC',
        deliveryNote: null,
        deliveryDate: null,
        notes: null,
        lines,
      }),
    },
    item: {
      findMany: async () => [
        { id: ITEM, partNo: 'P-1', allowFraction: false, status: 'ACTIVE' },
      ],
    },
    bin: { findMany: specialBinRows },
    $transaction: async (run: (t: typeof tx) => Promise<unknown>) => run(tx),
  });
  const stock = {
    post: options.stockPost ?? (async () => []),
  } as unknown as StockPostingService;
  const numbering = {
    next: async () => ({ number: 'GRN/LOC/26/0001' }),
  } as unknown as NumberingService;
  const events = { publish: async () => 'evt' } as unknown as EventBus;
  const service = new GrnsService(
    prisma,
    fakeAudit().service,
    numbering,
    events,
    stock,
    fakeStore,
  );
  vi.spyOn(service, 'detail').mockResolvedValue({ id: GRN } as GrnDto);
  return { service, claims };
}

const receivedLine = (qtyGood: string, qtyDamaged = '0') => ({
  id: LINE,
  itemId: ITEM,
  qtyExpected: null,
  qtyGood: new Prisma.Decimal(qtyGood),
  qtyDamaged: new Prisma.Decimal(qtyDamaged),
  wrongItem: false,
  notes: null,
});

describe('GRN transitions', () => {
  it('sends a checked GRN back to draft when it is edited', async () => {
    const { service, claims } = grns({ status: 'CHECKED' });
    await service.update(policy, GRN, { version: 3, notes: 'Box torn' });
    expect(claims[0]?.data).toMatchObject({
      status: 'DRAFT',
      checkedBy: null,
      checkedAt: null,
      notes: 'Box torn',
    });
    expect(claims[0]?.where).toMatchObject({
      id: GRN,
      version: 3,
      status: { in: ['DRAFT', 'CHECKED'] },
    });
  });

  it('keeps the delivery-note quantity when an edit leaves it out', async () => {
    const { service } = grns();
    const kept = { ...receivedLine('4'), qtyExpected: new Prisma.Decimal(5) };
    const plan = await service.planLines(
      [kept],
      [
        {
          id: LINE,
          itemId: ITEM,
          qtyGood: '4',
          qtyDamaged: '0',
          wrongItem: false,
        },
        {
          itemId: ITEM,
          qtyExpected: '2',
          qtyGood: '2',
          qtyDamaged: '0',
          wrongItem: false,
        },
      ],
    );
    expect(plan.map((p) => [p.id, p.lineNo, p.qtyExpected])).toEqual([
      [LINE, 1, '5'],
      [null, 2, '2'],
    ]);
  });

  it('refuses a part-unit delivery-note quantity for whole-unit items', async () => {
    const { service } = grns();
    const error = await failure(
      service.planLines(
        [],
        [
          {
            itemId: ITEM,
            qtyExpected: '1.5',
            qtyGood: '1',
            qtyDamaged: '0',
            wrongItem: false,
          },
        ],
      ),
    );
    expect(codeOf(error)).toBe('INVALID_INPUT');
  });

  it('refuses to check a GRN with nothing received', async () => {
    const { service } = grns({ lines: [receivedLine('0')] });
    const error = await failure(service.check(policy, GRN, 3));
    expect(codeOf(error)).toBe('INVALID_INPUT');
  });

  it('stamps the checker when checking', async () => {
    const { service, claims } = grns({ lines: [receivedLine('2')] });
    await service.check(policy, GRN, 3);
    expect(claims[0]?.data).toMatchObject({
      status: 'CHECKED',
      checkedBy: policy.userId,
    });
  });

  it('rejects an old version before touching anything', async () => {
    const { service, claims } = grns({ lines: [receivedLine('2')] });
    const error = await failure(service.check(policy, GRN, 2));
    expect(codeOf(error)).toBe('STALE');
    expect(claims).toHaveLength(0);
  });

  it('refuses to post a draft', async () => {
    const { service } = grns({ status: 'DRAFT' });
    const error = await failure(service.post(policy, GRN, 3));
    expect(error).toBeInstanceOf(ConflictException);
    expect(codeOf(error)).toBe('INVALID_STATE');
  });

  it('reports a lost posting race as stale', async () => {
    const { service } = grns({ status: 'CHECKED', claimCount: 0 });
    const error = await failure(service.post(policy, GRN, 3));
    expect(codeOf(error)).toBe('STALE');
  });

  it('refuses to reverse once the stock has been used', async () => {
    const { service } = grns({
      status: 'PUT_AWAY',
      lines: [receivedLine('5')],
      ledger: [
        {
          id: 'l1',
          itemId: ITEM,
          binId: BIN,
          qty: new Prisma.Decimal(5),
          docLineId: LINE,
        },
      ],
      stockPost: async () => insufficient(ITEM, 'A-01-01-A'),
    });
    const error = await failure(
      service.reverse(policy, GRN, { version: 3, reason: 'Wrong supplier' }),
    );
    expect(codeOf(error)).toBe('GRN_STOCK_USED');
    expect((error.getResponse() as { message: string }).message).toBe(
      "Some of this stock has already been used, so the GRN can't be reversed.",
    );
  });
});

describe('put-away checks', () => {
  function putaway(binKind: string, qtyGood = '4', qtyPutAway = '1') {
    const tx = {
      grn: {
        updateMany: async () => ({ count: 1 }),
        findMany: async () => [
          {
            id: GRN,
            number: 'GRN/LOC/26/0001',
            lines: [
              {
                id: LINE,
                itemId: ITEM,
                qtyGood: new Prisma.Decimal(qtyGood),
                qtyPutAway: new Prisma.Decimal(qtyPutAway),
                item: { partNo: 'P-1', allowFraction: false, status: 'ACTIVE' },
              },
            ],
          },
        ],
      },
    };
    const prisma = asPrisma({
      bin: {
        findMany: async (args: { where: { code?: unknown } }) =>
          args.where.code
            ? specialBinRows()
            : [{ id: BIN, storeId: STORE_ID, kind: binKind, active: true }],
      },
      grnLine: { findMany: async () => [{ id: LINE, grnId: GRN }] },
      $transaction: async (run: (t: typeof tx) => Promise<unknown>) => run(tx),
    });
    return new PutawayService(
      prisma,
      fakeAudit().service,
      { publish: async () => 'evt' } as unknown as EventBus,
      { post: async () => [] } as unknown as StockPostingService,
      fakeStore,
    );
  }

  it('only puts stock into storage bins', async () => {
    const error = await failure(
      putaway('QUARANTINE').putAway(policy, {
        moves: [{ grnLineId: LINE, binId: BIN, qty: '1' }],
      }),
    );
    expect(codeOf(error)).toBe('INVALID_INPUT');
  });

  it('refuses to put away more than is left on the line', async () => {
    const error = await failure(
      putaway('STORAGE').putAway(policy, {
        moves: [
          { grnLineId: LINE, binId: BIN, qty: '2' },
          { grnLineId: LINE, binId: BIN, qty: '2' },
        ],
      }),
    );
    expect(codeOf(error)).toBe('PUTAWAY_TOO_MUCH');
    expect((error.getResponse() as { message: string }).message).toBe(
      'Only 3 of P-1 is left to put away.',
    );
  });

  it('refuses part units for items counted whole', async () => {
    const error = await failure(
      putaway('STORAGE').putAway(policy, {
        moves: [{ grnLineId: LINE, binId: BIN, qty: '1.5' }],
      }),
    );
    expect(codeOf(error)).toBe('INVALID_INPUT');
  });
});
