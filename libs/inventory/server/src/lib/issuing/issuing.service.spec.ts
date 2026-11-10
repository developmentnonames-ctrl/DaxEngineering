import { ForbiddenException, type HttpException } from '@nestjs/common';
import type { MrnDto } from '@dax/inventory-contract';
import type {
  AttachmentAccessRegistry,
  EventBus,
  NumberingService,
  Policy,
} from '@dax/platform-core';
import { Prisma } from '@dax/platform-db';
import type { StockPostingService } from '../stock/stock-posting.service';
import { asPrisma, fakeAudit, fakePolicy, fakeStore } from '../testing';
import { AodsService } from './aods.service';
import { HoldsService } from './holds.service';
import { MrnsService } from './mrns.service';
import type { MrnReleaseGate } from './shared';

const ID = '0190a000-0000-7000-8000-000000000501';
const LINE = '0190a000-0000-7000-8000-000000000502';
const ITEM = '0190a000-0000-7000-8000-000000000101';
const DEPT = '0190a000-0000-7000-8000-000000000601';
const CUSTOMER = '0190a000-0000-7000-8000-000000000701';

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

function withoutField(
  policy: Policy,
  entityKey: string,
  field: string,
): Policy {
  const fields = new Map(policy.fields);
  const access = fields.get(entityKey);
  fields.set(entityKey, {
    read: new Set([...(access?.read ?? [])].filter((f) => f !== field)),
    write: new Set(access?.write ?? []),
  });
  return { ...policy, fields };
}

function withScope(
  policy: Policy,
  permission: string,
  scope: 'OWN' | 'DEPARTMENT',
): Policy {
  const permissions = new Map(policy.permissions);
  permissions.set(permission, { scope, storeIds: [] });
  return { ...policy, permissions, departmentIds: [DEPT] };
}

const holdRow = {
  id: ID,
  number: 'HLD/26/0001',
  status: 'ACTIVE',
  departmentId: DEPT,
  departmentName: 'Service',
  customerId: CUSTOMER,
  customerName: 'Acme Plantations',
  createdAt: new Date('2026-11-01T00:00:00Z'),
  _count: { lines: 1 },
};

const engine = (overrides: Partial<Record<string, unknown>> = {}) =>
  ({
    lockFreeQty: async () => new Prisma.Decimal(10),
    reserve: async () => undefined,
    release: async () => new Prisma.Decimal(0),
    transfer: async () => undefined,
    ...overrides,
  }) as unknown as StockPostingService;

const numbering = {
  next: async () => ({ number: 'X/26/0001' }),
} as unknown as NumberingService;

describe('holds', () => {
  function holds(
    findMany: (args: unknown) => Promise<unknown[]>,
    stock = engine(),
  ) {
    const tx = {
      hold: { create: async () => ({ id: ID, lines: [] }) },
    };
    const prisma = asPrisma({
      hold: { findMany, count: async () => 1 },
      department: {
        findUnique: async () => ({ id: DEPT, name: 'Service', active: true }),
      },
      customer: { findUnique: async () => null },
      item: {
        findMany: async () => [
          { id: ITEM, partNo: 'P-1', allowFraction: false, status: 'ACTIVE' },
        ],
      },
      $transaction: async (run: (t: typeof tx) => Promise<unknown>) => run(tx),
    });
    return new HoldsService(prisma, fakeAudit().service, numbering, stock);
  }

  it('hides the customer from people who may not read it', async () => {
    const policy = fakePolicy(['inventory.hold.view']);
    const service = holds(async () => [holdRow]);
    const shown = await service.list(policy, {
      status: 'ACTIVE',
      page: 1,
      limit: 50,
    });
    expect(shown.items[0]?.customer).toEqual({
      id: CUSTOMER,
      name: 'Acme Plantations',
    });
    const hidden = await service.list(
      withoutField(policy, 'inventory.hold', 'customerName'),
      { status: 'ACTIVE', page: 1, limit: 50 },
    );
    expect(hidden.items[0]).not.toHaveProperty('customer');
  });

  it('limits the list to what the viewer may see', async () => {
    const calls: unknown[] = [];
    const service = holds(async (args) => {
      calls.push(args);
      return [];
    });
    const base = fakePolicy(['inventory.hold.view']);
    await service.list(withScope(base, 'inventory.hold.view', 'OWN'), {
      status: 'ALL',
      page: 1,
      limit: 50,
    });
    await service.list(withScope(base, 'inventory.hold.view', 'DEPARTMENT'), {
      status: 'ALL',
      page: 1,
      limit: 50,
    });
    expect(JSON.stringify(calls[0])).toContain(`"createdBy":"${base.userId}"`);
    expect(JSON.stringify(calls[1])).toContain(
      `"departmentId":{"in":["${DEPT}"]}`,
    );
  });

  it('refuses the whole hold when a part is short, naming it', async () => {
    const service = holds(
      async () => [],
      engine({ lockFreeQty: async () => new Prisma.Decimal(2) }),
    );
    const error = await failure(
      service.create(fakePolicy(['inventory.hold.create']), {
        departmentId: DEPT,
        lines: [
          { itemId: ITEM, qty: '2' },
          { itemId: ITEM, qty: '1' },
        ],
      }),
    );
    expect(codeOf(error)).toBe('NOT_ENOUGH_FREE_STOCK');
    expect((error.getResponse() as { message: string }).message).toBe(
      'Only 2 of P-1 is free.',
    );
  });
});

describe('request checking', () => {
  function mrns(gates: MrnReleaseGate[], free = '10') {
    const updates: Record<string, unknown>[] = [];
    const reserved: string[] = [];
    const tx = {
      mrn: {
        updateMany: async () => ({ count: 1 }),
        update: async (args: { data: Record<string, unknown> }) => {
          updates.push(args.data);
          return {};
        },
        findUniqueOrThrow: async () => ({
          id: ID,
          number: 'MRN/SRV/26/0001',
          subtype: 'SRV',
          departmentId: DEPT,
          customerId: null,
        }),
      },
      mrnLine: {
        findMany: async () => [
          {
            id: LINE,
            itemId: ITEM,
            qtyRequested: new Prisma.Decimal(4),
            qtyIssued: new Prisma.Decimal(0),
            qtyShortClosed: new Prisma.Decimal(0),
            item: { partNo: 'P-1' },
          },
        ],
      },
      reservation: { findMany: async () => [] },
    };
    const prisma = asPrisma({
      mrn: { findUnique: async () => ({ status: 'SUBMITTED', version: 2 }) },
      $transaction: async (run: (t: typeof tx) => Promise<unknown>) => run(tx),
    });
    const stock = engine({
      lockFreeQty: async () => new Prisma.Decimal(free),
      reserve: async (_tx: unknown, r: { qty: Prisma.Decimal }) => {
        reserved.push(r.qty.toFixed());
      },
    });
    const service = new MrnsService(
      prisma,
      fakeAudit().service,
      numbering,
      stock,
      fakeStore,
      gates,
    );
    vi.spyOn(service, 'detail').mockResolvedValue({ id: ID } as MrnDto);
    return { service, updates, reserved };
  }
  const policy = fakePolicy(['inventory.mrn.check']);

  it('reserves everything and becomes ready when stock is free', async () => {
    const { service, updates, reserved } = mrns([]);
    await service.check(policy, ID, 2);
    expect(reserved).toEqual(['4']);
    expect(updates).toContainEqual({ status: 'READY' });
  });

  it('reserves what is free and leaves the request checked', async () => {
    const { service, updates, reserved } = mrns([], '1.5');
    await service.check(policy, ID, 2);
    expect(reserved).toEqual(['1.5']);
    expect(updates).toContainEqual({ status: 'CHECKED' });
  });

  it('holds back a fully reserved request when a release gate says no', async () => {
    const gate: MrnReleaseGate = {
      name: 'accounts',
      check: async () => ({ ok: false, reason: 'Payment not received' }),
    };
    const { service, updates } = mrns([gate]);
    await service.check(policy, ID, 2);
    expect(updates).toContainEqual({ status: 'CHECKED' });
  });

  it('rejects an old version', async () => {
    const { service } = mrns([]);
    expect(codeOf(await failure(service.check(policy, ID, 1)))).toBe('STALE');
  });

  it('needs request rights to convert a hold', async () => {
    const { service } = mrns([]);
    const error = await failure(
      service.convertHold(fakePolicy(['inventory.hold.convert']), ID, {
        version: 1,
        subtype: 'SRV',
      }),
    );
    expect(error).toBeInstanceOf(ForbiddenException);
  });
});

describe('AOD creation', () => {
  it('allows only one AOD being picked per request', async () => {
    const tx = {
      $queryRaw: async () => [{ status: 'READY' }],
      aod: { count: async () => 1 },
    };
    const prisma = asPrisma({
      mrn: { findUnique: async () => ({ status: 'READY' }) },
      $transaction: async (run: (t: typeof tx) => Promise<unknown>) => run(tx),
    });
    const service = new AodsService(
      prisma,
      fakeAudit().service,
      numbering,
      { publish: async () => 'evt' } as unknown as EventBus,
      engine(),
      fakeStore,
      {} as MrnsService,
      { register: () => undefined } as unknown as AttachmentAccessRegistry,
    );
    const error = await failure(
      service.create(fakePolicy(['inventory.aod.issue']), {
        mrnId: ID,
        type: 'SER',
      }),
    );
    expect(codeOf(error)).toBe('AOD_IN_PROGRESS');
  });
});
