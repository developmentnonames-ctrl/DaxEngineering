import { parse as parseCsv } from 'csv-parse/sync';
import {
  BarcodeInput,
  ITEM_CSV_COLUMNS,
  ITEM_CSV_MAX_ROWS,
  ItemInput,
  normalizePartNo,
  UOMS,
} from '@dax/inventory-contract';
import type { ImportResult } from '@dax/contracts';
import { isWhole } from './stock-math';

type Column = (typeof ITEM_CSV_COLUMNS)[number];
export type ImportError = ImportResult['errors'][number];

export interface ImportLookups {
  brands: ReadonlyMap<string, { id: string; active: boolean }>;
  machineModels: ReadonlyMap<string, { id: string }>;
  storageBins: ReadonlyMap<string, { id: string }>;
  existingItems: ReadonlySet<string>;
  barcodesInUse: ReadonlySet<string>;
}

export interface ImportRow {
  row: number;
  partNo: string;
  partNoNorm: string;
  brandName: string;
  description: string;
  uom: string;
  minQty: string;
  defaultBinCode: string;
  machineModelNames: string[];
  barcodes: string[];
  notes: string | null;
}

export interface ValidItem {
  row: number;
  partNo: string;
  partNoNorm: string;
  brandId: string;
  description: string;
  uom: string;
  allowFraction: boolean;
  minQty: string;
  defaultBinId: string | null;
  machineModelIds: string[];
  barcodes: string[];
  notes: string | null;
}

export const itemKey = (brandId: string, partNoNorm: string) =>
  `${brandId}|${partNoNorm}`;
export const nameKey = (name: string) => name.trim().toLowerCase();

const RowFields = ItemInput.pick({
  partNo: true,
  description: true,
  uom: true,
  minQty: true,
  notes: true,
});
const FIELD_ERRORS: Record<string, { column: Column; message: string }> = {
  partNo: {
    column: 'part_no',
    message: 'Part number is required (up to 60 characters).',
  },
  description: {
    column: 'description',
    message: 'Description is required (up to 200 characters).',
  },
  uom: { column: 'uom', message: 'Unknown unit.' },
  minQty: {
    column: 'min_qty',
    message: 'Minimum quantity must be a number with up to 3 decimals.',
  },
  notes: { column: 'notes', message: 'Notes can be up to 1000 characters.' },
};

const list = (value: string) =>
  value
    .split('|')
    .map((v) => v.trim())
    .filter(Boolean);

export type ReadResult =
  | { ok: true; rows: ImportRow[] }
  | { ok: false; total: number; errors: ImportError[] };

function fileError(message: string, total = 0): ReadResult {
  return { ok: false, total, errors: [{ row: 0, field: null, message }] };
}

export function readItemCsv(text: string): ReadResult {
  let records: string[][];
  try {
    records = parseCsv(text, {
      bom: true,
      skip_empty_lines: true,
      relax_column_count: true,
    }) as string[][];
  } catch (error) {
    const line = (error as { lines?: unknown }).lines;
    return fileError(
      typeof line === 'number'
        ? `The file is not valid CSV (near line ${line}).`
        : 'The file is not valid CSV.',
    );
  }
  const [header, ...data] = records;
  if (!header) return fileError('The file is empty.');
  const names = header.map((h) => h.trim().toLowerCase());
  const missing = ITEM_CSV_COLUMNS.filter((c) => !names.includes(c));
  const unknown = names.filter(
    (n) => n && !(ITEM_CSV_COLUMNS as readonly string[]).includes(n),
  );
  if (missing.length || unknown.length) {
    return fileError(
      `The header must be: ${ITEM_CSV_COLUMNS.join(',')}.` +
        (missing.length ? ` Missing: ${missing.join(', ')}.` : '') +
        (unknown.length ? ` Unknown: ${unknown.join(', ')}.` : ''),
    );
  }
  if (data.length === 0) return fileError('The file has no rows.');
  if (data.length > ITEM_CSV_MAX_ROWS) {
    return fileError(
      `At most ${ITEM_CSV_MAX_ROWS} rows per file (this one has ${data.length}).`,
      data.length,
    );
  }
  const index = Object.fromEntries(
    ITEM_CSV_COLUMNS.map((c) => [c, names.indexOf(c)]),
  ) as Record<Column, number>;
  const rows = data.map((cells, i): ImportRow => {
    const cell = (c: Column) => (cells[index[c]] ?? '').trim();
    const partNo = cell('part_no');
    return {
      row: i + 2,
      partNo,
      partNoNorm: normalizePartNo(partNo),
      brandName: cell('brand'),
      description: cell('description'),
      uom: cell('uom').toUpperCase(),
      minQty: cell('min_qty') || '0',
      defaultBinCode: cell('default_bin').toUpperCase(),
      machineModelNames: list(cell('machine_models')),
      barcodes: list(cell('barcodes')),
      notes: cell('notes') || null,
    };
  });
  return { ok: true, rows };
}

export function validateImport(
  rows: readonly ImportRow[],
  lookups: ImportLookups,
): { items: ValidItem[]; errors: ImportError[] } {
  const errors: ImportError[] = [];
  const items: ValidItem[] = [];
  const seenItems = new Map<string, number>();
  const seenBarcodes = new Map<string, number>();

  for (const r of rows) {
    const fail = (field: Column | null, message: string) =>
      errors.push({ row: r.row, field, message });
    const before = errors.length;

    const parsed = RowFields.safeParse({
      partNo: r.partNo,
      description: r.description,
      uom: r.uom,
      minQty: r.minQty,
      notes: r.notes ?? undefined,
    });
    if (!parsed.success) {
      const keys = new Set(
        parsed.error.issues.map((i) => String(i.path[0] ?? '')),
      );
      for (const key of keys) {
        const known = FIELD_ERRORS[key];
        fail(known?.column ?? null, known?.message ?? 'Check this row.');
      }
    }
    if (r.partNo && !r.partNoNorm) {
      fail('part_no', 'The part number needs at least one letter or digit.');
    }

    const brand = r.brandName
      ? lookups.brands.get(nameKey(r.brandName))
      : undefined;
    if (!r.brandName) fail('brand', 'Brand is required.');
    else if (!brand) fail('brand', `Unknown brand "${r.brandName}".`);
    else if (!brand.active)
      fail('brand', `Brand "${r.brandName}" is inactive.`);

    const uom = UOMS.find((u) => u.code === r.uom);
    if (uom && parsed.success && !uom.fraction && !isWhole(r.minQty)) {
      fail(
        'min_qty',
        `Minimum quantity must be a whole number for ${uom.code}.`,
      );
    }

    const bin = r.defaultBinCode
      ? lookups.storageBins.get(r.defaultBinCode)
      : undefined;
    if (r.defaultBinCode && !bin) {
      fail('default_bin', `No active storage bin "${r.defaultBinCode}".`);
    }

    const modelIds: string[] = [];
    if (r.machineModelNames.length > 50) {
      fail('machine_models', 'At most 50 machine models per item.');
    }
    for (const name of r.machineModelNames) {
      const model = lookups.machineModels.get(nameKey(name));
      if (!model) fail('machine_models', `Unknown machine model "${name}".`);
      else if (!modelIds.includes(model.id)) modelIds.push(model.id);
    }

    const codes = [...new Set(r.barcodes)];
    for (const code of codes) {
      if (!BarcodeInput.shape.code.safeParse(code).success) {
        fail('barcodes', `Barcode "${code}" is not valid.`);
      } else if (lookups.barcodesInUse.has(code)) {
        fail('barcodes', `Barcode "${code}" is already used by another item.`);
      } else if (seenBarcodes.has(code)) {
        fail(
          'barcodes',
          `Barcode "${code}" is also on row ${seenBarcodes.get(code)}.`,
        );
      }
    }

    if (brand && r.partNoNorm) {
      const key = itemKey(brand.id, r.partNoNorm);
      if (lookups.existingItems.has(key)) {
        fail('part_no', 'This part number already exists for this brand.');
      } else if (seenItems.has(key)) {
        fail('part_no', `Duplicate of row ${seenItems.get(key)}.`);
      } else {
        seenItems.set(key, r.row);
      }
    }
    for (const code of codes)
      if (!seenBarcodes.has(code)) seenBarcodes.set(code, r.row);

    if (errors.length > before || !parsed.success || !brand || !uom) continue;
    items.push({
      row: r.row,
      partNo: parsed.data.partNo,
      partNoNorm: r.partNoNorm,
      brandId: brand.id,
      description: parsed.data.description,
      uom: uom.code,
      allowFraction: uom.fraction,
      minQty: parsed.data.minQty,
      defaultBinId: bin?.id ?? null,
      machineModelIds: modelIds,
      barcodes: codes,
      notes: parsed.data.notes ?? null,
    });
  }
  return { items, errors };
}
