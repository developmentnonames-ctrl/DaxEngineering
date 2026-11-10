import type { HttpException } from '@nestjs/common';
import { SPECIAL_ZONE_CODE, type ReturnDto } from '@dax/inventory-contract';
import type { NumberingService } from '@dax/platform-core';
import { Prisma } from '@dax/platform-db';
import { binParts } from '../bin-codes';
import type {
  Movement,
  StockPostingService,
} from '../stock/stock-posting.service';
import {
  asPrisma,
  fakeAudit,
  fakePolicy,
  fakeStore,
  STORE_ID,
} from '../testing';
import type {
  TagFromReturn,
  WarrantyService,
} from '../warranty/warranty.service';
import { ReturnsService } from './returns.service';

const ID = '0190a000-0000-7000-8000-000000000801';
const AOD = '0190a000-0000-7000-8000-000000000802';
const AOD_LINE = '0190a000-0000-7000-8000-000000000803';
const ITEM = '0190a000-0000-7000-8000-000000000101';
const DEPT = '0190a000-0000-7000-8000-000000000601';
const SHELF = '0190a000-0000-7000-8000-000000000301';
const QUA = '0190a000-0000-7000-8000-000000000302';
const LINE_GOOD = '0190a000-0000-7000-8000-000000000811';
const LINE_DAMAGED = '0190a000-0000-7000-8000-000000000812';
const LINE_FAULTY = '0190a000-0000-7000-8000-000000000813';
const TAG = '0190a000-0000-7000-8000-000000000901';

const code = (p: string) => binParts(SPECIAL_ZONE_CODE, 0, 0, p).code;
const D = (v: string | number) => new Prisma.Decimal(v);

async function failure(promise: Promise<unknown>): Promise<HttpException> {
  try {
    await promise;
  } catch (error) {
    return error as HttpException;
  }
  throw new Error('Expected a failure');
}
const bodyOf = (error: HttpException) =>
  error.getResponse() as { code?: string; message?: string; fields?: string[] };

const numbering = {
  next: async () => ({ number: 'RTN/26/0001' }),
} as unknown as NumberingService;

function bins(args: { where: { code?: unknown; id?: unknown } }) {
  if (args.where.code) {
    return [
      { id: '0190a000-0000-7000-8000-000000000300', code: code('RCV') },
      { id: QUA, code: code('QUA') },
      { id: '0190a000-0000-7000-8000-000000000303', code: code('WTY') },
    ];
  }
  return [
    {
      id: SHELF,
      code: 'A-01-01-A',
      storeId: STORE_ID,
      kind: 'STORAGE',
      active: true,
      countId: null,
    },
  ];
}

interface Setup {
  returned?: string;
  aodQty?: string;
  lines?: unknown[];
}

function setup({ returned = '0', aodQty = '3', lines = [] }: Setup = {}) {
  const created: { data: Record<string, unknown> }[] = [];
  const posted: Movement[] = [];
  const tagged: TagFromReturn[] = [];
  const lineUpdates: unknown[] = [];
  const noteUpdates: Record<string, unknown>[] = [];
  const shared = {
    bin: { findMany: async (args: never) => bins(args) },
    aodLine: {
      findMany: async () => [
        {
          id: AOD_LINE,
          itemId: ITEM,
          qty: D(aodQty),
          item: { partNo: 'P-1' },
        },
      ],
    },
    returnLine: {
      findMany: async () =>
        returned === '0' ? [] : [{ aodLineId: AOD_LINE, qty: D(returned) }],
      update: async (args: unknown) => {
        lineUpdates.push(args);
        return {};
      },
    },
  };
  const tx = {
    ...shared,
    $queryRaw: async () => [{ status: 'SIGNED' }],
    returnNote: {
      create: async (args: { data: Record<string, unknown> }) => {
        created.push(args);
        return { id: ID };
      },
      updateMany: async () => ({ count: 1 }),
      update: async (args: { data: Record<string, unknown> }) => {
        noteUpdates.push(args.data);
        return {};
      },
      findUniqueOrThrow: async () => ({
        customerId: null,
        customerName: null,
        jobNumber: 'J-7',
        lines,
      }),
    },
  };
  const prisma = asPrisma({
    ...shared,
    aod: {
      findUnique: async () => ({
        status: 'ISSUED',
        mrn: {
          departmentId: DEPT,
          departmentName: 'Workshop',
          customerId: null,
          customerName: null,
          jobNumber: 'J-7',
        },
      }),
    },
    returnNote: {
      findUnique: async () => ({ status: 'DRAFT', version: 1, aodId: AOD }),
    },
    department: {
      findUnique: async () => ({ id: DEPT, name: 'Workshop', active: true }),
    },
    customer: { findUnique: async () => null },
    item: {
      findMany: async () => [
        { id: ITEM, partNo: 'P-1', allowFraction: false, status: 'ACTIVE' },
      ],
    },
    $transaction: async (run: (t: typeof tx) => Promise<unknown>) => run(tx),
  });
  const stock = {
    post: async (_tx: unknown, movements: Movement[]) => {
      posted.push(...movements);
      return [];
    },
  } as unknown as StockPostingService;
  const warranty = {
    tagFromReturn: async (
      _tx: unknown,
      _actor: string,
      input: TagFromReturn,
    ) => {
      tagged.push(input);
      return { id: TAG, number: 'WTY/26/0001' };
    },
  } as unknown as WarrantyService;
  const service = new ReturnsService(
    prisma,
    fakeAudit().service,
    numbering,
    stock,
    fakeStore,
    warranty,
  );
  vi.spyOn(service, 'detail').mockResolvedValue({ id: ID } as ReturnDto);
  return { service, created, posted, tagged, lineUpdates, noteUpdates };
}

const policy = fakePolicy([
  'inventory.return_note.create',
  'inventory.return_note.post',
]);

const createdLines = (created: { data: Record<string, unknown> }[]) =>
  (created[0]?.data['lines'] as { create: Record<string, unknown>[] }).create;

describe('creating returns', () => {
  it('refuses to return more than is left on the AOD line', async () => {
    const { service } = setup({ returned: '2' });
    const error = await failure(
      service.create(policy, {
        aodId: AOD,
        lines: [
          {
            aodLineId: AOD_LINE,
            itemId: ITEM,
            qty: '2',
            condition: 'GOOD',
            binId: SHELF,
          },
        ],
      }),
    );
    expect(bodyOf(error)).toMatchObject({
      code: 'OVER_RETURN',
      message: 'Only 1 of P-1 can still be returned from this AOD.',
    });
  });

  it('copies the department and job from the AOD', async () => {
    const { service, created } = setup();
    await service.create(policy, {
      aodId: AOD,
      lines: [
        {
          aodLineId: AOD_LINE,
          itemId: ITEM,
          qty: '3',
          condition: 'GOOD',
          binId: SHELF,
        },
      ],
    });
    expect(created[0]?.data).toMatchObject({
      aodId: AOD,
      departmentId: DEPT,
      departmentName: 'Workshop',
      jobNumber: 'J-7',
    });
  });

  it('needs a reason for a free return', async () => {
    const { service } = setup();
    const error = await failure(
      service.create(policy, {
        departmentId: DEPT,
        reason: 'odd',
        lines: [{ itemId: ITEM, qty: '1', condition: 'GOOD', binId: SHELF }],
      }),
    );
    expect(bodyOf(error)).toMatchObject({
      code: 'INVALID_INPUT',
      fields: ['reason'],
    });
  });

  it('sends damaged parts to quarantine whatever bin was chosen', async () => {
    const { service, created } = setup();
    await service.create(policy, {
      departmentId: DEPT,
      reason: 'Left over after the job',
      lines: [
        { itemId: ITEM, qty: '1', condition: 'DAMAGED', binId: SHELF },
        { itemId: ITEM, qty: '1', condition: 'FAULTY', notes: 'No output' },
      ],
    });
    expect(
      createdLines(created).map((l) => [l['condition'], l['binId']]),
    ).toEqual([
      ['DAMAGED', QUA],
      ['FAULTY', null],
    ]);
  });

  it('refuses whole units in fractions', async () => {
    const { service } = setup();
    const error = await failure(
      service.create(policy, {
        departmentId: DEPT,
        reason: 'Left over after the job',
        lines: [{ itemId: ITEM, qty: '0.5', condition: 'GOOD', binId: SHELF }],
      }),
    );
    expect(bodyOf(error).fields).toEqual(['lines.0.qty']);
  });
});

describe('posting returns', () => {
  const line = (id: string, condition: string, qty: string) => ({
    id,
    aodLineId: AOD_LINE,
    itemId: ITEM,
    qty: D(qty),
    condition,
    binId: condition === 'GOOD' ? SHELF : condition === 'DAMAGED' ? QUA : null,
    serialNo: condition === 'FAULTY' ? 'SN-1' : null,
    notes: condition === 'FAULTY' ? 'Does not start' : null,
    item: { partNo: 'P-1' },
  });

  it('posts good and damaged stock and tags faulty parts without stock', async () => {
    const { service, posted, tagged, lineUpdates, noteUpdates } = setup({
      lines: [
        line(LINE_GOOD, 'GOOD', '1'),
        line(LINE_DAMAGED, 'DAMAGED', '1'),
        line(LINE_FAULTY, 'FAULTY', '1'),
      ],
    });
    await service.post(policy, ID, 1);
    expect(noteUpdates).toContainEqual(
      expect.objectContaining({ status: 'POSTED', number: 'RTN/26/0001' }),
    );
    expect(posted.map((m) => [m.docLineId, m.binId, m.movement])).toEqual([
      [LINE_GOOD, SHELF, 'RETURN'],
      [LINE_DAMAGED, QUA, 'RETURN'],
    ]);
    expect(posted.every((m) => m.docType === 'RTN' && m.docId === ID)).toBe(
      true,
    );
    expect(tagged).toEqual([
      expect.objectContaining({
        itemId: ITEM,
        serialNo: 'SN-1',
        fault: 'Does not start',
        jobNumber: 'J-7',
        returnLineId: LINE_FAULTY,
      }),
    ]);
    expect(lineUpdates).toEqual([
      { where: { id: LINE_FAULTY }, data: { warrantyTagId: TAG } },
    ]);
  });

  it('checks again inside the post that the AOD line is not over-returned', async () => {
    const { service, posted } = setup({
      returned: '3',
      lines: [line(LINE_GOOD, 'GOOD', '1')],
    });
    const error = await failure(service.post(policy, ID, 1));
    expect(bodyOf(error).code).toBe('OVER_RETURN');
    expect(posted).toEqual([]);
  });

  it('rejects an old version', async () => {
    const { service } = setup();
    expect(bodyOf(await failure(service.post(policy, ID, 0))).code).toBe(
      'STALE',
    );
  });
});
