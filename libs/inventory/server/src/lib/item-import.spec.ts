import { ITEM_CSV_COLUMNS, ITEM_CSV_MAX_ROWS } from '@dax/inventory-contract';
import { type ImportLookups, readItemCsv, validateImport } from './item-import';
import { ItemsService } from './items.service';
import { asPrisma, fakeAudit, fakePolicy, fakeStore } from './testing';

const HEADER = ITEM_CSV_COLUMNS.join(',');
const CAT = '0190a000-0000-7000-8000-0000000000c1';
const MODEL = '0190a000-0000-7000-8000-0000000000d1';
const BIN = '0190a000-0000-7000-8000-0000000000b1';

const lookups: ImportLookups = {
  brands: new Map([
    ['caterpillar', { id: CAT, active: true }],
    ['old brand', { id: 'x', active: false }],
  ]),
  machineModels: new Map([['320d', { id: MODEL }]]),
  storageBins: new Map([['A-01-01-A', { id: BIN }]]),
  existingItems: new Set([`${CAT}|EXISTING1`]),
  barcodesInUse: new Set(['5000000000001']),
};

function csv(...rows: string[]): string {
  return [HEADER, ...rows].join('\n');
}

function validate(text: string) {
  const read = readItemCsv(text);
  if (!read.ok) throw new Error(read.errors[0]?.message);
  return validateImport(read.rows, lookups);
}

describe('item CSV validation', () => {
  it('accepts a good row and resolves names case-insensitively', () => {
    const { items, errors } = validate(
      csv(
        '1R-0750,CATERPILLAR,Fuel filter,pcs,2,a-01-01-a,320D | 320d,5012345678900|5012345678901,Keep dry',
      ),
    );
    expect(errors).toEqual([]);
    expect(items[0]).toMatchObject({
      row: 2,
      partNo: '1R-0750',
      partNoNorm: '1R0750',
      brandId: CAT,
      uom: 'PCS',
      allowFraction: false,
      minQty: '2',
      defaultBinId: BIN,
      machineModelIds: [MODEL],
      barcodes: ['5012345678900', '5012345678901'],
      notes: 'Keep dry',
    });
  });

  it('defaults an empty minimum to zero and allows fractions for metres', () => {
    const { items, errors } = validate(
      csv(
        'HOSE-1,Caterpillar,Hose,M,,,,,',
        'HOSE-2,Caterpillar,Hose,M,1.5,,,,',
      ),
    );
    expect(errors).toEqual([]);
    expect(items.map((i) => i.minQty)).toEqual(['0', '1.5']);
  });

  it('reports each problem with its row and column', () => {
    const { items, errors } = validate(
      csv(
        'P-1,Unknown,Thing,PCS,1,,,,',
        'P-2,Caterpillar,Thing,BAG,1,,,,',
        'P-3,Caterpillar,Thing,PCS,1.5,,,,',
        'P-4,Caterpillar,Thing,PCS,1,Z-99-99-Z,,,',
        'P-5,Caterpillar,Thing,PCS,1,,Nope,,',
        'P-6,Caterpillar,Thing,PCS,1,,,5000000000001,',
        'existing-1,Caterpillar,Thing,PCS,1,,,,',
        'P-8,Old brand,Thing,PCS,1,,,,',
        '---,Caterpillar,Thing,PCS,1,,,,',
        'P-10,Caterpillar,,PCS,1,,,,',
      ),
    );
    expect(items).toEqual([]);
    expect(errors.map((e) => [e.row, e.field])).toEqual([
      [2, 'brand'],
      [3, 'uom'],
      [4, 'min_qty'],
      [5, 'default_bin'],
      [6, 'machine_models'],
      [7, 'barcodes'],
      [8, 'part_no'],
      [9, 'brand'],
      [10, 'part_no'],
      [11, 'description'],
    ]);
    expect(errors[0]?.message).toBe('Unknown brand "Unknown".');
  });

  it('catches duplicates inside the file', () => {
    const { errors } = validate(
      csv(
        '1R-0750,Caterpillar,A,PCS,0,,,111,',
        '1r 0750,caterpillar,B,PCS,0,,,222,',
        '2R-1,Caterpillar,C,PCS,0,,,111,',
      ),
    );
    expect(errors).toEqual([
      { row: 3, field: 'part_no', message: 'Duplicate of row 2.' },
      { row: 4, field: 'barcodes', message: 'Barcode "111" is also on row 2.' },
    ]);
  });

  it('rejects a wrong header, an empty file and too many rows', () => {
    const header = readItemCsv('part,brand\nx,y');
    expect(header.ok).toBe(false);
    expect(readItemCsv('').ok).toBe(false);
    expect(readItemCsv(HEADER).ok).toBe(false);
    const rows = Array.from(
      { length: ITEM_CSV_MAX_ROWS + 1 },
      (_, i) => `P${i},Caterpillar,X,PCS,0,,,,`,
    );
    const big = readItemCsv(csv(...rows));
    expect(big).toMatchObject({ ok: false, total: ITEM_CSV_MAX_ROWS + 1 });
  });

  it('reports malformed CSV instead of throwing', () => {
    const read = readItemCsv(`${HEADER}\n"unterminated,Caterpillar`);
    expect(read.ok).toBe(false);
  });
});

describe('ItemsService.import', () => {
  function service() {
    const writes: string[] = [];
    const tx = {
      item: {
        createManyAndReturn: async (args: {
          data: { brandId: string; partNoNorm: string }[];
        }) => {
          writes.push('item');
          return args.data.map((d, i) => ({
            id: `id-${i}`,
            brandId: d.brandId,
            partNoNorm: d.partNoNorm,
          }));
        },
      },
      itemMachineModel: { createMany: async () => writes.push('models') },
      itemBarcode: { createMany: async () => writes.push('barcodes') },
    };
    const prisma = asPrisma({
      brand: {
        findMany: async () => [{ id: CAT, name: 'Caterpillar', active: true }],
      },
      machineModel: { findMany: async () => [{ id: MODEL, name: '320D' }] },
      bin: { findMany: async () => [] },
      item: { findMany: async () => [] },
      itemBarcode: { findMany: async () => [] },
      $transaction: async (run: (t: typeof tx) => Promise<unknown>) => {
        writes.push('transaction');
        return run(tx);
      },
    });
    const audit = fakeAudit();
    return {
      items: new ItemsService(prisma, audit.service, fakeStore),
      writes,
      audit,
    };
  }
  const policy = fakePolicy(['inventory.item.import']);

  it('never writes on a dry run', async () => {
    const { items, writes } = service();
    const result = await items.import(
      policy,
      csv('P-1,Caterpillar,A,PCS,0,,320D,111,'),
      true,
    );
    expect(result).toEqual({ dryRun: true, total: 1, created: 0, errors: [] });
    expect(writes).toEqual([]);
  });

  it('writes nothing when any row fails', async () => {
    const { items, writes } = service();
    const result = await items.import(
      policy,
      csv('P-1,Caterpillar,A,PCS,0,,,,', 'P-2,Unknown,B,PCS,0,,,,'),
      false,
    );
    expect(result.created).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(writes).toEqual([]);
  });

  it('creates every row in one transaction', async () => {
    const { items, writes, audit } = service();
    const result = await items.import(
      policy,
      csv('P-1,Caterpillar,A,PCS,0,,320D,111,', 'P-2,Caterpillar,B,PCS,0,,,,'),
      false,
    );
    expect(result).toEqual({ dryRun: false, total: 2, created: 2, errors: [] });
    expect(writes).toEqual(['transaction', 'item', 'models', 'barcodes']);
    expect(audit.entries).toEqual([
      expect.objectContaining({ action: 'imported', after: { count: 2 } }),
    ]);
  });
});
