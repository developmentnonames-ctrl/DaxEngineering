import type { HttpException } from '@nestjs/common';
import {
  WarrantyClose,
  type WarrantyDto,
  WarrantySend,
  WarrantyTagInput,
} from '@dax/inventory-contract';
import type {
  AttachmentAccessRegistry,
  NumberingService,
} from '@dax/platform-core';
import { Prisma, type TransactionClient } from '@dax/platform-db';
import { asPrisma, fakeAudit, fakePolicy, fakeStore } from '../testing';
import { WarrantyService } from './warranty.service';

const TAG = '0190a000-0000-7000-8000-000000000901';
const ITEM = '0190a000-0000-7000-8000-000000000101';
const OTHER_ITEM = '0190a000-0000-7000-8000-000000000102';
const SUPPLIER = '0190a000-0000-7000-8000-000000000501';
const LINE = '0190a000-0000-7000-8000-000000000601';
const WTY = '0190a000-0000-7000-8000-000000000404';

const policy = fakePolicy([
  'inventory.warranty.tag',
  'inventory.warranty.send',
  'inventory.warranty.close',
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

interface FakeOptions {
  status?: string;
  version?: number;
  claimCount?: number;
  itemStatus?: string;
  allowFraction?: boolean;
  supplierActive?: boolean;
  returnLineId?: string | null;
}

function warranty(options: FakeOptions = {}) {
  const creates: { data: Record<string, unknown> }[] = [];
  const claims: { where: unknown; data: Record<string, unknown> }[] = [];
  const numbers: unknown[] = [];
  const audit = fakeAudit();
  const db = {
    warrantyTag: {
      findUnique: async () => ({
        status: options.status ?? 'TAGGED',
        version: options.version ?? 2,
        itemId: ITEM,
        qty: new Prisma.Decimal('1'),
        serialNo: 'SN-1',
        machineModelId: null,
        machineSerial: null,
        jobNumber: null,
        customerId: null,
        supplierId: options.status === 'SENT' ? SUPPLIER : null,
        claimNumber: null,
        fault: 'Does not start',
        returnLineId: options.returnLineId ?? null,
      }),
      create: async (args: { data: Record<string, unknown> }) => {
        creates.push(args);
        return { id: TAG };
      },
      updateMany: async (args: {
        where: unknown;
        data: Record<string, unknown>;
      }) => {
        claims.push(args);
        return { count: options.claimCount ?? 1 };
      },
    },
    item: {
      findMany: async () => [
        {
          id: ITEM,
          partNo: 'P-1',
          allowFraction: options.allowFraction ?? false,
          status: options.itemStatus ?? 'ACTIVE',
        },
        {
          id: OTHER_ITEM,
          partNo: 'P-2',
          allowFraction: false,
          status: 'ACTIVE',
        },
      ],
    },
    supplier: {
      findUnique: async () => ({
        id: SUPPLIER,
        name: 'Acme Spares',
        active: options.supplierActive ?? true,
        isForeign: false,
      }),
    },
    bin: {
      findMany: async () => [
        { id: 'r', code: 'X-00-00-RCV' },
        { id: 'q', code: 'X-00-00-QUA' },
        { id: WTY, code: 'X-00-00-WTY' },
      ],
    },
  };
  const prisma = asPrisma({
    ...db,
    $transaction: async (run: (t: typeof db) => Promise<unknown>) => run(db),
  });
  const numbering = {
    next: async (_tx: unknown, args: unknown) => {
      numbers.push(args);
      return { number: 'WTY/26/0001' };
    },
  } as unknown as NumberingService;
  const service = new WarrantyService(
    prisma,
    audit.service,
    numbering,
    fakeStore,
    {} as AttachmentAccessRegistry,
  );
  vi.spyOn(service, 'detail').mockResolvedValue({ id: TAG } as WarrantyDto);
  return { service, creates, claims, numbers, audit: audit.entries, db };
}

const tagInput = (extra: object = {}) =>
  WarrantyTagInput.parse({
    itemId: ITEM,
    fault: 'Motor burnt out',
    ...extra,
  });

describe('tagging a failed part', () => {
  it('numbers the tag and puts it in the warranty bin', async () => {
    const { service, creates, numbers, audit } = warranty();
    await service.create(policy, tagInput({ serialNo: 'SN-9' }));
    expect(numbers).toEqual([expect.objectContaining({ docType: 'WTY' })]);
    expect(creates[0]?.data).toMatchObject({
      number: 'WTY/26/0001',
      binId: WTY,
      itemId: ITEM,
      qty: '1',
      serialNo: 'SN-9',
      fault: 'Motor burnt out',
      supplierId: null,
    });
    expect(audit).toEqual([
      expect.objectContaining({ entityId: TAG, action: 'create' }),
    ]);
  });

  it('snapshots the supplier name when one is given', async () => {
    const { service, creates } = warranty();
    await service.create(policy, tagInput({ supplierId: SUPPLIER }));
    expect(creates[0]?.data).toMatchObject({
      supplierId: SUPPLIER,
      supplierName: 'Acme Spares',
    });
  });

  it('refuses an archived part', async () => {
    const { service, creates } = warranty({ itemStatus: 'ARCHIVED' });
    const error = await failure(service.create(policy, tagInput()));
    expect(codeOf(error)).toBe('INVALID_INPUT');
    expect(creates).toEqual([]);
  });

  it('refuses a fraction of a whole-unit part', async () => {
    const { service } = warranty();
    const error = await failure(
      service.create(policy, tagInput({ qty: '1.5' })),
    );
    expect(codeOf(error)).toBe('INVALID_INPUT');
  });

  it('needs a fault description', () => {
    expect(
      WarrantyTagInput.safeParse({ itemId: ITEM, fault: 'bad' }).success,
    ).toBe(false);
  });

  it('still tags parts from a return', async () => {
    const { service, creates, db } = warranty();
    const result = await service.tagFromReturn(
      db as unknown as TransactionClient,
      policy.userId,
      {
        itemId: ITEM,
        qty: new Prisma.Decimal('2'),
        serialNo: null,
        jobNumber: 'J-1',
        customer: null,
        fault: 'Faulty on return',
        returnLineId: LINE,
      },
    );
    expect(result).toEqual({ id: TAG, number: 'WTY/26/0001' });
    expect(creates[0]?.data).toMatchObject({
      binId: WTY,
      qty: '2',
      returnLineId: LINE,
    });
  });
});

describe('editing a tag', () => {
  it('saves only what changed and bumps the version', async () => {
    const { service, claims, audit } = warranty();
    await service.update(policy, TAG, {
      version: 2,
      serialNo: 'SN-1',
      jobNumber: 'J-77',
    });
    expect(claims[0]?.where).toMatchObject({ id: TAG, version: 2 });
    expect(claims[0]?.data).toMatchObject({
      jobNumber: 'J-77',
      version: { increment: 1 },
    });
    expect(claims[0]?.data).not.toHaveProperty('serialNo');
    expect(audit[0]).toMatchObject({
      action: 'update',
      after: { jobNumber: 'J-77' },
      before: { jobNumber: null },
    });
  });

  it('rejects a stale version', async () => {
    const { service, claims } = warranty({ version: 3 });
    const error = await failure(
      service.update(policy, TAG, { version: 2, jobNumber: 'J-1' }),
    );
    expect(codeOf(error)).toBe('STALE');
    expect(claims).toEqual([]);
  });

  it('rejects a lost race', async () => {
    const { service } = warranty({ claimCount: 0 });
    const error = await failure(
      service.update(policy, TAG, { version: 2, jobNumber: 'J-1' }),
    );
    expect(codeOf(error)).toBe('STALE');
  });

  it('refuses edits once closed', async () => {
    const { service } = warranty({ status: 'CLOSED' });
    const error = await failure(
      service.update(policy, TAG, { version: 2, jobNumber: 'J-1' }),
    );
    expect(codeOf(error)).toBe('INVALID_STATE');
  });

  it('keeps the supplier on a sent part', async () => {
    const { service } = warranty({ status: 'SENT' });
    const error = await failure(
      service.update(policy, TAG, { version: 2, supplierId: null }),
    );
    expect(codeOf(error)).toBe('INVALID_INPUT');
  });

  it('keeps the part on a tag from a return', async () => {
    const { service } = warranty({ returnLineId: LINE });
    const error = await failure(
      service.update(policy, TAG, { version: 2, itemId: OTHER_ITEM }),
    );
    expect(codeOf(error)).toBe('INVALID_INPUT');
  });
});

describe('sending to the supplier', () => {
  it('needs a supplier', () => {
    expect(WarrantySend.safeParse({ version: 2 }).success).toBe(false);
  });

  it('marks the tag sent with the supplier snapshot', async () => {
    const { service, claims, audit } = warranty();
    await service.send(policy, TAG, {
      version: 2,
      supplierId: SUPPLIER,
      claimNumber: 'CLM-1',
    });
    expect(claims[0]?.where).toMatchObject({ status: 'TAGGED', version: 2 });
    expect(claims[0]?.data).toMatchObject({
      status: 'SENT',
      supplierId: SUPPLIER,
      supplierName: 'Acme Spares',
      claimNumber: 'CLM-1',
      sentBy: policy.userId,
    });
    expect(audit[0]).toMatchObject({ action: 'sent' });
  });

  it('refuses an inactive supplier', async () => {
    const { service } = warranty({ supplierActive: false });
    const error = await failure(
      service.send(policy, TAG, { version: 2, supplierId: SUPPLIER }),
    );
    expect(codeOf(error)).toBe('INVALID_INPUT');
  });

  it.each(['SENT', 'CLOSED'])('refuses a %s tag', async (status) => {
    const { service } = warranty({ status });
    const error = await failure(
      service.send(policy, TAG, { version: 2, supplierId: SUPPLIER }),
    );
    expect(codeOf(error)).toBe('INVALID_STATE');
  });
});

describe('closing a tag', () => {
  it('needs an outcome', () => {
    expect(WarrantyClose.safeParse({ version: 2 }).success).toBe(false);
  });

  it.each(['REJECTED', 'SCRAPPED'])('needs a note when %s', (outcome) => {
    expect(WarrantyClose.safeParse({ version: 2, outcome }).success).toBe(
      false,
    );
  });

  it('closes a sent tag with the outcome', async () => {
    const { service, claims, audit } = warranty({ status: 'SENT' });
    await service.close(policy, TAG, {
      version: 2,
      outcome: 'REPLACED',
      note: null,
    });
    expect(claims[0]?.data).toMatchObject({
      status: 'CLOSED',
      outcome: 'REPLACED',
      closeNote: null,
      closedBy: policy.userId,
    });
    expect(audit[0]).toMatchObject({
      action: 'closed',
      before: { status: 'SENT' },
    });
  });

  it('enforces the note rule in the service too', async () => {
    const { service, claims } = warranty();
    const error = await failure(
      service.close(policy, TAG, { version: 2, outcome: 'SCRAPPED' }),
    );
    expect(codeOf(error)).toBe('INVALID_INPUT');
    expect(claims).toEqual([]);
  });

  it('refuses a closed tag', async () => {
    const { service } = warranty({ status: 'CLOSED' });
    const error = await failure(
      service.close(policy, TAG, { version: 2, outcome: 'CREDITED' }),
    );
    expect(codeOf(error)).toBe('INVALID_STATE');
  });

  it('rejects a stale version', async () => {
    const { service } = warranty({ version: 5 });
    const error = await failure(
      service.close(policy, TAG, { version: 2, outcome: 'CREDITED' }),
    );
    expect(codeOf(error)).toBe('STALE');
  });
});
