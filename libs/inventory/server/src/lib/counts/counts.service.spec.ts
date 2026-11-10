import { ConflictException, type HttpException } from '@nestjs/common';
import type { NumberingService, Policy } from '@dax/platform-core';
import { Prisma } from '@dax/platform-db';
import type {
  Movement,
  StockPostingService,
} from '../stock/stock-posting.service';
import { asPrisma, fakeAudit, fakePolicy, fakeStore } from '../testing';
import { CountsService } from './counts.service';

const COUNT = '0190a000-0000-7000-8000-000000000801';
const BIN = '0190a000-0000-7000-8000-000000000201';
const ITEM_A = '0190a000-0000-7000-8000-000000000101';
const ITEM_B = '0190a000-0000-7000-8000-000000000102';
const LINE_A = '0190a000-0000-7000-8000-000000000811';
const LINE_B = '0190a000-0000-7000-8000-000000000812';
const OTHER = '0190a000-0000-7000-8000-0000000000bb';

const MANAGER = fakePolicy([
  'inventory.count.view',
  'inventory.count.create',
  'inventory.count.count',
  'inventory.count.submit',
  'inventory.count.approve',
  'inventory.count.cancel',
]);
const KEEPER = fakePolicy([
  'inventory.count.view',
  'inventory.count.count',
  'inventory.count.submit',
]);

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

const item = (id: string, partNo: string) => ({
  id,
  partNo,
  description: 'Filter',
  uom: 'PCS',
  brand: { name: 'Acme' },
});

function countRow(overrides: Record<string, unknown> = {}) {
  return {
    id: COUNT,
    number: 'CNT/26/0001',
    kind: 'CYCLE',
    status: 'COUNTING',
    blind: false,
    notes: null,
    version: 1,
    createdAt: new Date('2026-11-01T00:00:00Z'),
    createdBy: OTHER,
    submittedBy: null,
    submittedAt: null,
    rejectReason: null,
    rejectedBy: null,
    rejectedAt: null,
    approvedBy: null,
    approvedAt: null,
    cancelledBy: null,
    cancelledAt: null,
    cancelReason: null,
    _count: { lines: 2 },
    lines: [
      {
        id: LINE_A,
        systemQty: new Prisma.Decimal(5),
        countedQty: new Prisma.Decimal(3),
        countedBy: OTHER,
        countedAt: new Date('2026-11-01T01:00:00Z'),
        added: false,
        adjustQty: null,
        bin: { id: BIN, code: 'A-01-01-A' },
        item: item(ITEM_A, 'P-1'),
      },
      {
        id: LINE_B,
        systemQty: new Prisma.Decimal(4),
        countedQty: new Prisma.Decimal(4),
        countedBy: OTHER,
        countedAt: new Date('2026-11-01T01:00:00Z'),
        added: false,
        adjustQty: null,
        bin: { id: BIN, code: 'A-01-01-A' },
        item: item(ITEM_B, 'P-2'),
      },
    ],
    ...overrides,
  };
}

interface Setup {
  row?: ReturnType<typeof countRow>;
  frozen?: number;
  blocked?: { code: string; number: string | null }[];
  txLines?: unknown[];
  stock?: { binId: string; itemId: string; qty: Prisma.Decimal }[];
  post?: (movements: readonly Movement[]) => Promise<unknown>;
}

function setup(options: Setup = {}) {
  const row = options.row ?? countRow();
  const sql: { text: string; values: unknown[] }[] = [];
  const posted: Movement[][] = [];
  const created: unknown[] = [];
  const raw =
    (result: (text: string) => unknown) =>
    async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join('?');
      sql.push({ text, values });
      return result(text);
    };
  const tx = {
    stockCount: {
      create: async () => ({ id: COUNT }),
      updateMany: async () => ({ count: 1 }),
    },
    countLine: {
      findMany: async () =>
        options.txLines ??
        row.lines.map((l) => ({
          id: l.id,
          binId: l.bin.id,
          itemId: l.item.id,
          countedQty: l.countedQty,
          bin: { code: l.bin.code },
          item: { partNo: l.item.partNo },
        })),
      createMany: async (args: unknown) => {
        created.push(args);
        return { count: 1 };
      },
      update: async () => ({}),
    },
    binStock: { findMany: async () => options.stock ?? [] },
    $queryRaw: raw((text) =>
      text.includes('LEFT JOIN') ? (options.blocked ?? []) : [],
    ),
    $executeRaw: raw((text) =>
      text.includes('SET count_id = ?') ? (options.frozen ?? 1) : 1,
    ),
  };
  const prisma = asPrisma({
    stockCount: { findUnique: async () => row },
    bin: {
      findMany: async () => [
        {
          id: BIN,
          code: 'A-01-01-A',
          kind: 'STORAGE',
          active: true,
          openedAt: null,
        },
      ],
    },
    zone: { count: async () => 0 },
    user: { findMany: async () => [{ id: OTHER, name: 'Keeper' }] },
    $transaction: async (run: (t: typeof tx) => Promise<unknown>) => run(tx),
  });
  const stock = {
    post: async (_tx: unknown, movements: readonly Movement[]) => {
      posted.push([...movements]);
      return options.post ? options.post(movements) : [];
    },
  } as unknown as StockPostingService;
  const numbering = {
    next: async () => ({ number: 'CNT/26/0001' }),
  } as unknown as NumberingService;
  const audit = fakeAudit();
  const service = new CountsService(
    prisma,
    audit.service,
    numbering,
    stock,
    fakeStore,
  );
  return { service, sql, posted, created, audit: audit.entries };
}

const withUser = (policy: Policy, userId: string): Policy => ({
  ...policy,
  userId,
});

describe('stock counts', () => {
  it('freezes the chosen bins and snapshots their stock', async () => {
    const { service, sql, created } = setup({
      stock: [{ binId: BIN, itemId: ITEM_A, qty: new Prisma.Decimal(5) }],
    });
    await service.create(MANAGER, {
      kind: 'CYCLE',
      blind: false,
      zoneIds: [],
      binIds: [BIN],
    });
    const freeze = sql.find((s) => s.text.includes('SET count_id = ?'));
    expect(freeze?.values).toContain(COUNT);
    expect(freeze?.text).toContain('count_id IS NULL');
    expect(created).toEqual([
      {
        data: [
          {
            countId: COUNT,
            binId: BIN,
            itemId: ITEM_A,
            systemQty: new Prisma.Decimal(5),
          },
        ],
      },
    ]);
  });

  it('refuses bins already in another count, naming them', async () => {
    const { service } = setup({
      frozen: 0,
      blocked: [{ code: 'A-01-01-A', number: 'CNT/26/0007' }],
    });
    const error = await failure(
      service.create(MANAGER, {
        kind: 'CYCLE',
        blind: false,
        zoneIds: [],
        binIds: [BIN],
      }),
    );
    expect(codeOf(error)).toBe('BIN_COUNTING');
    expect(error.message).toContain('A-01-01-A');
    expect(error.message).toContain('CNT/26/0007');
  });

  it('only submits once every line has a counted quantity', async () => {
    const { service } = setup({ txLines: [{ countedQty: null }] });
    const error = await failure(service.submit(KEEPER, COUNT, 1));
    expect(codeOf(error)).toBe('NOT_COUNTED');
  });

  it('posts the differences on approval and unfreezes the bins', async () => {
    const { service, posted, sql, audit } = setup({
      row: countRow({ status: 'SUBMITTED', submittedBy: OTHER }),
      stock: [
        { binId: BIN, itemId: ITEM_A, qty: new Prisma.Decimal(5) },
        { binId: BIN, itemId: ITEM_B, qty: new Prisma.Decimal(4) },
      ],
    });
    await service.approve(MANAGER, COUNT, 1);
    expect(posted).toEqual([
      [
        {
          itemId: ITEM_A,
          binId: BIN,
          qty: '-2',
          movement: 'COUNT_ADJUST',
          docType: 'CNT',
          docId: COUNT,
          docLineId: LINE_A,
          docNumber: 'CNT/26/0001',
        },
      ],
    ]);
    const adjust = sql.find((s) => s.text.includes('adjust_qty'));
    expect(adjust?.values).toEqual([
      [LINE_A, LINE_B],
      ['-2', '0'],
    ]);
    expect(sql.some((s) => s.text.includes('SET count_id = NULL'))).toBe(true);
    expect(sql.some((s) => s.text.includes('opened_at'))).toBe(false);
    expect(audit).toHaveLength(1);
  });

  it('marks bins opened when an opening count is approved', async () => {
    const { service, posted, sql } = setup({
      row: countRow({
        kind: 'OPENING',
        status: 'SUBMITTED',
        submittedBy: OTHER,
      }),
    });
    await service.approve(MANAGER, COUNT, 1);
    expect(posted[0]?.map((m) => [m.movement, m.qty])).toEqual([
      ['OPENING', '3'],
      ['OPENING', '4'],
    ]);
    expect(sql.some((s) => s.text.includes('SET opened_at = now()'))).toBe(
      true,
    );
  });

  it('refuses approval by someone who counted or submitted', async () => {
    const counted = setup({
      row: countRow({ status: 'SUBMITTED', submittedBy: OTHER }),
    });
    const error = await failure(
      counted.service.approve(withUser(MANAGER, OTHER), COUNT, 1),
    );
    expect(codeOf(error)).toBe('SELF_APPROVAL');
    expect(error.message).toContain('Another Stores Manager');
    expect(counted.posted).toEqual([]);

    const submitted = setup({
      row: countRow({ status: 'SUBMITTED', submittedBy: MANAGER.userId }),
    });
    expect(
      codeOf(await failure(submitted.service.approve(MANAGER, COUNT, 1))),
    ).toBe('SELF_APPROVAL');
  });

  it('names the part when a shortfall would break reserved stock', async () => {
    const { service } = setup({
      row: countRow({ status: 'SUBMITTED', submittedBy: OTHER }),
      stock: [{ binId: BIN, itemId: ITEM_A, qty: new Prisma.Decimal(5) }],
      post: async () => {
        throw new ConflictException({
          code: 'INSUFFICIENT_STOCK',
          itemId: ITEM_A,
          bin: 'A-01-01-A',
        });
      },
    });
    const error = await failure(service.approve(MANAGER, COUNT, 1));
    expect(codeOf(error)).toBe('INSUFFICIENT_STOCK');
    expect(error.message).toContain('P-1');
    expect(error.message).toContain('A-01-01-A');
  });

  it('unfreezes the bins when a count is cancelled', async () => {
    const { service, sql, posted } = setup();
    await service.cancel(MANAGER, COUNT, {
      version: 1,
      reason: 'Started on the wrong zone',
    });
    expect(sql.some((s) => s.text.includes('SET count_id = NULL'))).toBe(true);
    expect(posted).toEqual([]);
  });

  it('hides system quantities on a blind count from counters', async () => {
    const { service } = setup({ row: countRow({ blind: true }) });
    const keeper = await service.detail(KEEPER, COUNT);
    expect(keeper.systemVisible).toBe(false);
    expect(keeper.bins[0]?.lines[0]).not.toHaveProperty('systemQty');
    expect(keeper.bins[0]?.lines[0]).not.toHaveProperty('difference');
    const manager = await service.detail(MANAGER, COUNT);
    expect(manager.bins[0]?.lines[0]).toMatchObject({
      systemQty: '5',
      countedQty: '3',
      difference: '-2',
    });
    expect(manager.countedLines).toBe(2);
  });
});
