import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  type HttpException,
} from '@nestjs/common';
import { Prisma } from '@dax/platform-db';
import { ItemsService } from './items.service';
import { LocationsService } from './locations.service';
import { ScanService } from './scan.service';
import { asPrisma, fakeAudit, fakePolicy, fakeStore } from './testing';

const ITEM = '0190a000-0000-7000-8000-000000000101';
const OTHER = '0190a000-0000-7000-8000-000000000102';
const BRAND = '0190a000-0000-7000-8000-0000000000c1';

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

function itemRow(version: number) {
  return {
    id: ITEM,
    version,
    brandId: BRAND,
    partNo: '1R-0750',
    partNoNorm: '1R0750',
    description: 'Filter',
    uom: 'PCS',
    minQty: new Prisma.Decimal(0),
    defaultBinId: null,
    notes: null,
    machineModels: [],
  };
}

describe('optimistic locking', () => {
  const policy = fakePolicy(['inventory.item.edit']);

  function items(updatedRows: number) {
    const tx = {
      item: { updateMany: async () => ({ count: updatedRows }) },
      itemMachineModel: {
        deleteMany: async () => ({}),
        createMany: async () => ({}),
      },
    };
    const prisma = asPrisma({
      item: { findUnique: async () => itemRow(3) },
      $transaction: async (run: (t: typeof tx) => Promise<unknown>) => run(tx),
    });
    return new ItemsService(prisma, fakeAudit().service, fakeStore);
  }

  it('rejects an edit made against an old version', async () => {
    const error = await failure(
      items(1).update(
        policy,
        ITEM,
        { description: 'New', version: 2 },
        new Set(['description', 'version']),
      ),
    );
    expect(error).toBeInstanceOf(ConflictException);
    expect(codeOf(error)).toBe('STALE');
  });

  it('rejects an edit that loses a race', async () => {
    const error = await failure(
      items(0).update(
        policy,
        ITEM,
        { description: 'New', version: 3 },
        new Set(['description', 'version']),
      ),
    );
    expect(error).toBeInstanceOf(ConflictException);
    expect(codeOf(error)).toBe('STALE');
  });

  it('rejects bin updates against an old version', async () => {
    const prisma = asPrisma({
      bin: {
        findUnique: async () => ({
          id: ITEM,
          code: 'A-01-01-A',
          kind: 'STORAGE',
          active: true,
          version: 5,
        }),
      },
    });
    const locations = new LocationsService(
      prisma,
      fakeAudit().service,
      fakeStore,
    );
    const error = await failure(
      locations.updateBin(fakePolicy(), ITEM, { notes: 'x', version: 4 }),
    );
    expect(codeOf(error)).toBe('STALE');
  });
});

describe('item rules', () => {
  const policy = fakePolicy(['inventory.item.edit']);

  it('blocks a whole-number unit with a fractional minimum', async () => {
    const service = new ItemsService(
      asPrisma({}),
      fakeAudit().service,
      fakeStore,
    );
    const error = await failure(
      service.create(policy, {
        partNo: '1R-0750',
        brandId: BRAND,
        description: 'Filter',
        uom: 'PCS',
        minQty: '1.5',
        defaultBinId: null,
        machineModelIds: [],
      }),
    );
    expect(error).toBeInstanceOf(BadRequestException);
  });

  it('rejects a replacement that would close a loop', async () => {
    const links: Record<string, string | null> = {
      [ITEM]: null,
      [OTHER]: ITEM,
    };
    const tx = {
      $executeRaw: async () => 0,
      item: {
        findUnique: async (args: { where: { id: string } }) => ({
          supersededById: links[args.where.id] ?? null,
        }),
        updateMany: async () => ({ count: 1 }),
      },
    };
    const prisma = asPrisma({
      item: {
        findUnique: async (args: { where: { id: string } }) => ({
          id: args.where.id,
          supersededById: links[args.where.id] ?? null,
        }),
      },
      $transaction: async (run: (t: typeof tx) => Promise<unknown>) => run(tx),
    });
    const service = new ItemsService(prisma, fakeAudit().service, fakeStore);
    const error = await failure(
      service.supersede(policy, ITEM, { replacementId: OTHER, version: 1 }),
    );
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error.getResponse() as { message: string }).message).toMatch(
      /loop/,
    );

    const self = await failure(
      service.supersede(policy, ITEM, { replacementId: ITEM, version: 1 }),
    );
    expect(self).toBeInstanceOf(BadRequestException);
  });

  it('refuses a barcode another item already uses', async () => {
    const prisma = asPrisma({
      item: { findUnique: async () => ({ id: ITEM }) },
      itemBarcode: { findUnique: async () => ({ id: OTHER }) },
    });
    const service = new ItemsService(prisma, fakeAudit().service, fakeStore);
    const error = await failure(
      service.addBarcode(policy, ITEM, {
        code: '5012345678900',
        kind: 'MANUFACTURER',
      }),
    );
    expect(codeOf(error)).toBe('BARCODE_IN_USE');
  });

  it('checks field write access', async () => {
    const readOnly = { ...policy, fields: new Map() };
    const service = new ItemsService(
      asPrisma({}),
      fakeAudit().service,
      fakeStore,
    );
    const error = await failure(
      service.update(
        readOnly,
        ITEM,
        { description: 'x', version: 1 },
        new Set(['description']),
      ),
    );
    expect(error).toBeInstanceOf(ForbiddenException);
  });
});

describe('ScanService', () => {
  const ITEM_TOKEN = 'AbC123xyZ789';

  function scanner() {
    return new ScanService(
      asPrisma({
        item: {
          findUnique: async (args: { where: { qrToken: string } }) =>
            args.where.qrToken === ITEM_TOKEN ? { id: ITEM } : null,
          findMany: async (args: { where: { partNoNorm: string } }) =>
            args.where.partNoNorm === '1R0750'
              ? [
                  {
                    id: ITEM,
                    partNo: '1R-0750',
                    description: 'Filter',
                    brand: { name: 'Caterpillar' },
                  },
                  {
                    id: OTHER,
                    partNo: '1R0750',
                    description: 'Filter',
                    brand: { name: 'Fleetguard' },
                  },
                ]
              : args.where.partNoNorm === 'ONLY1'
                ? [
                    {
                      id: OTHER,
                      partNo: 'ONLY-1',
                      description: 'X',
                      brand: { name: 'B' },
                    },
                  ]
                : [],
        },
        bin: {
          findUnique: async () => null,
          findFirst: async (args: { where: { code: string } }) =>
            args.where.code === 'A-01-03-B' ? { id: OTHER } : null,
        },
        itemBarcode: {
          findUnique: async (args: { where: { code: string } }) =>
            args.where.code === '5012345678900' ? { itemId: OTHER } : null,
        },
      }),
      fakeStore,
    );
  }
  const viewer = fakePolicy(['inventory.item.view', 'inventory.location.view']);

  it('resolves QR URLs and bare tokens', async () => {
    const path = `/inventory/items/${ITEM}`;
    expect(
      await scanner().resolve(viewer, `https://x.test/q/i/${ITEM_TOKEN}`),
    ).toEqual({ type: 'item', id: ITEM, path });
    expect(await scanner().resolve(viewer, ITEM_TOKEN)).toEqual({
      type: 'item',
      id: ITEM,
      path,
    });
  });

  it('resolves barcodes, bin codes and part numbers', async () => {
    expect(await scanner().resolve(viewer, '5012345678900')).toMatchObject({
      type: 'item',
      id: OTHER,
    });
    expect(await scanner().resolve(viewer, 'a-01-03-b')).toEqual({
      type: 'bin',
      id: OTHER,
      path: `/inventory/locations/bins/${OTHER}`,
    });
    expect(await scanner().resolve(viewer, 'only 1')).toMatchObject({
      type: 'item',
      id: OTHER,
    });
    const choices = await scanner().resolve(viewer, '1r0750');
    expect(choices.type).toBe('choices');
    expect(await scanner().resolve(viewer, 'nothing')).toEqual({
      type: 'none',
    });
  });

  it('returns none when the result type is not allowed', async () => {
    const binsOnly = fakePolicy(['inventory.location.view']);
    expect(await scanner().resolve(binsOnly, ITEM_TOKEN)).toEqual({
      type: 'none',
    });
    expect(await scanner().resolve(binsOnly, '1R-0750')).toEqual({
      type: 'none',
    });
    expect(await scanner().byToken(binsOnly, 'item', ITEM_TOKEN)).toEqual({
      type: 'none',
    });
  });
});
