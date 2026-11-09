import { z } from 'zod';
import { OptionalText, PageQuery, pageOf, Qty } from '@dax/contracts';

export const UOMS = [
  { code: 'PCS', label: 'Pieces', fraction: false },
  { code: 'SET', label: 'Sets', fraction: false },
  { code: 'PAIR', label: 'Pairs', fraction: false },
  { code: 'KIT', label: 'Kits', fraction: false },
  { code: 'BOX', label: 'Boxes', fraction: false },
  { code: 'ROLL', label: 'Rolls', fraction: false },
  { code: 'M', label: 'Metres', fraction: true },
  { code: 'L', label: 'Litres', fraction: true },
  { code: 'KG', label: 'Kilograms', fraction: true },
] as const;
export const UOM_CODES = UOMS.map((u) => u.code) as [string, ...string[]];

export function normalizePartNo(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export const BIN_PART = {
  zone: /^[A-Z]{1,3}$/,
  rack: /^\d{1,3}$/,
  shelf: /^\d{1,2}$/,
  position: /^[A-Z0-9]{1,3}$/,
};

export function binCode(parts: {
  zone: string;
  rack: string;
  shelf: string;
  position: string;
}): string {
  return [
    parts.zone.toUpperCase(),
    parts.rack.padStart(2, '0'),
    parts.shelf.padStart(2, '0'),
    parts.position.toUpperCase(),
  ].join('-');
}

export const QR_PATHS = { item: 'i', bin: 'b' } as const;
export function qrUrl(origin: string, kind: 'item' | 'bin', token: string) {
  return `${origin}/q/${QR_PATHS[kind]}/${token}`;
}

const Ref = z.object({ id: z.uuid(), name: z.string() });
const ItemRef = z.object({
  id: z.uuid(),
  partNo: z.string(),
  brand: z.string(),
});

export const BrandDto = z.object({
  id: z.uuid(),
  name: z.string(),
  active: z.boolean(),
  itemCount: z.int(),
});
export type BrandDto = z.infer<typeof BrandDto>;
export const BrandInput = z.strictObject({
  name: z.string().trim().min(1).max(60),
  active: z.boolean().default(true),
});
export type BrandInput = z.infer<typeof BrandInput>;

export const MachineModelDto = z.object({
  id: z.uuid(),
  name: z.string(),
  brand: Ref.nullable(),
  active: z.boolean(),
  itemCount: z.int(),
});
export type MachineModelDto = z.infer<typeof MachineModelDto>;
export const MachineModelInput = z.strictObject({
  name: z.string().trim().min(1).max(80),
  brandId: z.uuid().nullable().default(null),
  active: z.boolean().default(true),
});
export type MachineModelInput = z.infer<typeof MachineModelInput>;
export const CatalogLists = z.object({
  brands: z.array(BrandDto),
  machineModels: z.array(MachineModelDto),
});
export type CatalogLists = z.infer<typeof CatalogLists>;

export const StockFigures = z.object({
  onHand: z.string(),
  held: z.string(),
  quarantine: z.string(),
  free: z.string(),
});
export type StockFigures = z.infer<typeof StockFigures>;

export const ItemSummary = z.object({
  id: z.uuid(),
  partNo: z.string(),
  brand: Ref,
  description: z.string(),
  uom: z.string(),
  status: z.enum(['ACTIVE', 'ARCHIVED']),
  supersededBy: ItemRef.nullable(),
  minQty: z.string(),
  stock: StockFigures,
  belowMin: z.boolean(),
});
export type ItemSummary = z.infer<typeof ItemSummary>;
export const ItemPage = pageOf(ItemSummary);
export type ItemPage = z.infer<typeof ItemPage>;

export const BARCODE_KINDS = ['MANUFACTURER', 'SUPPLIER', 'ALTERNATE'] as const;
export const ItemDetail = ItemSummary.extend({
  allowFraction: z.boolean(),
  defaultBin: z.object({ id: z.uuid(), code: z.string() }).nullable(),
  machineModels: z.array(Ref),
  barcodes: z.array(
    z.object({ id: z.uuid(), code: z.string(), kind: z.enum(BARCODE_KINDS) }),
  ),
  supersedes: z.array(ItemRef),
  latestReplacement: ItemRef.nullable(),
  notes: z.string().nullable(),
  stockByBin: z.array(
    z.object({ binId: z.uuid(), binCode: z.string(), qty: z.string() }),
  ),
  version: z.int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ItemDetail = z.infer<typeof ItemDetail>;

const itemFields = {
  partNo: z.string().trim().min(1).max(60),
  brandId: z.uuid(),
  description: z.string().trim().min(1).max(200),
  uom: z.enum(UOM_CODES),
  minQty: Qty,
  defaultBinId: z.uuid().nullable(),
  machineModelIds: z.array(z.uuid()).max(50),
  notes: OptionalText(1000),
};
export const ItemInput = z.strictObject({
  ...itemFields,
  minQty: itemFields.minQty.default('0'),
  defaultBinId: itemFields.defaultBinId.default(null),
  machineModelIds: itemFields.machineModelIds.default([]),
});
export type ItemInput = z.infer<typeof ItemInput>;
export const ItemUpdate = z
  .strictObject(itemFields)
  .partial()
  .extend({ version: z.int() });
export type ItemUpdate = z.infer<typeof ItemUpdate>;
export const SupersedeInput = z.strictObject({
  replacementId: z.uuid().nullable(),
  version: z.int(),
});
export const ItemStatusInput = z.strictObject({
  status: z.enum(['ACTIVE', 'ARCHIVED']),
  version: z.int(),
});
export const BarcodeInput = z.strictObject({
  code: z
    .string()
    .trim()
    .min(3)
    .max(64)
    .regex(/^[\x21-\x7e]+$/, 'Printable characters only'),
  kind: z.enum(BARCODE_KINDS),
});
export type BarcodeInput = z.infer<typeof BarcodeInput>;

export const ItemQuery = PageQuery.extend({
  brandId: z.uuid().optional(),
  machineModelId: z.uuid().optional(),
  status: z.enum(['ACTIVE', 'ARCHIVED', 'ALL']).default('ACTIVE'),
  belowMin: z.enum(['true', 'false']).optional(),
});
export type ItemQuery = z.infer<typeof ItemQuery>;

export const BIN_KINDS = [
  'STORAGE',
  'RECEIVING',
  'QUARANTINE',
  'WARRANTY',
] as const;
export const ZoneDto = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  active: z.boolean(),
  binCount: z.int(),
});
export type ZoneDto = z.infer<typeof ZoneDto>;
export const ZoneInput = z.strictObject({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(BIN_PART.zone, 'One to three letters'),
  name: z.string().trim().min(1).max(60),
});
export type ZoneInput = z.infer<typeof ZoneInput>;

export const BinDto = z.object({
  id: z.uuid(),
  code: z.string(),
  zone: z.object({ id: z.uuid(), code: z.string() }),
  rack: z.string(),
  shelf: z.string(),
  position: z.string(),
  kind: z.enum(BIN_KINDS),
  active: z.boolean(),
  itemCount: z.int(),
  notes: z.string().nullable(),
  version: z.int(),
});
export type BinDto = z.infer<typeof BinDto>;
export const BinPage = pageOf(BinDto);
export type BinPage = z.infer<typeof BinPage>;
export const BinDetail = BinDto.extend({
  stock: z.array(
    z.object({
      itemId: z.uuid(),
      partNo: z.string(),
      brand: z.string(),
      description: z.string(),
      uom: z.string(),
      qty: z.string(),
    }),
  ),
});
export type BinDetail = z.infer<typeof BinDetail>;
export const BinQuery = PageQuery.extend({
  zoneId: z.uuid().optional(),
  kind: z.enum(BIN_KINDS).optional(),
  active: z.enum(['true', 'false', 'all']).default('true'),
});
export type BinQuery = z.infer<typeof BinQuery>;
export const BinInput = z.strictObject({
  zoneId: z.uuid(),
  rack: z.string().trim().regex(BIN_PART.rack, 'Rack number, e.g. 1 or 01'),
  shelf: z.string().trim().regex(BIN_PART.shelf, 'Shelf number, e.g. 3'),
  position: z
    .string()
    .trim()
    .toUpperCase()
    .regex(BIN_PART.position, 'Up to three letters or digits'),
  kind: z.enum(BIN_KINDS).default('STORAGE'),
  notes: OptionalText(300),
});
export type BinInput = z.infer<typeof BinInput>;
export const BinUpdate = z.strictObject({
  kind: z.enum(BIN_KINDS).optional(),
  active: z.boolean().optional(),
  notes: OptionalText(300),
  version: z.int(),
});
export type BinUpdate = z.infer<typeof BinUpdate>;
export const BinBulkInput = z
  .strictObject({
    zoneId: z.uuid(),
    racks: z.object({
      from: z.int().min(1).max(999),
      to: z.int().min(1).max(999),
    }),
    shelves: z.object({
      from: z.int().min(1).max(99),
      to: z.int().min(1).max(99),
    }),
    positions: z
      .array(z.string().trim().toUpperCase().regex(BIN_PART.position))
      .min(1)
      .max(26),
    kind: z.enum(BIN_KINDS).default('STORAGE'),
  })
  .refine((b) => b.racks.from <= b.racks.to && b.shelves.from <= b.shelves.to, {
    message: '"From" must not be after "to"',
  })
  .refine(
    (b) =>
      (b.racks.to - b.racks.from + 1) *
        (b.shelves.to - b.shelves.from + 1) *
        b.positions.length <=
      500,
    { message: 'At most 500 bins at a time' },
  );
export type BinBulkInput = z.infer<typeof BinBulkInput>;
export const BinBulkResult = z.object({
  created: z.int(),
  skipped: z.array(z.string()),
});

export const StockRow = z.object({
  item: ItemRef.extend({ description: z.string(), uom: z.string() }),
  stock: StockFigures,
  minQty: z.string(),
  belowMin: z.boolean(),
  bins: z.array(z.object({ code: z.string(), qty: z.string() })),
});
export type StockRow = z.infer<typeof StockRow>;
export const StockPage = pageOf(StockRow);
export type StockPage = z.infer<typeof StockPage>;
export const StockQuery = PageQuery.extend({
  zoneId: z.uuid().optional(),
  belowMin: z.enum(['true', 'false']).optional(),
  inStock: z.enum(['true', 'false']).optional(),
});
export type StockQuery = z.infer<typeof StockQuery>;

export const LABELS_PER_SHEET = 24;
export const LabelRequest = z.strictObject({
  kind: z.enum(['item', 'bin']),
  ids: z.array(z.uuid()).min(1).max(240),
  copies: z.int().min(1).max(24).default(1),
  skip: z
    .int()
    .min(0)
    .max(LABELS_PER_SHEET - 1)
    .default(0),
});
export type LabelRequest = z.infer<typeof LabelRequest>;

export const ScanResult = z.discriminatedUnion('type', [
  z.object({ type: z.literal('item'), id: z.uuid(), path: z.string() }),
  z.object({ type: z.literal('bin'), id: z.uuid(), path: z.string() }),
  z.object({
    type: z.literal('choices'),
    items: z.array(
      ItemRef.extend({ description: z.string(), path: z.string() }),
    ),
  }),
  z.object({ type: z.literal('none') }),
]);
export type ScanResult = z.infer<typeof ScanResult>;

export const ITEM_CSV_COLUMNS = [
  'part_no',
  'brand',
  'description',
  'uom',
  'min_qty',
  'default_bin',
  'machine_models',
  'barcodes',
  'notes',
] as const;

export const BrandUpdate = z
  .strictObject({
    name: z.string().trim().min(1).max(60),
    active: z.boolean(),
  })
  .partial();
export type BrandUpdate = z.infer<typeof BrandUpdate>;
export const MachineModelUpdate = z
  .strictObject({
    name: z.string().trim().min(1).max(80),
    brandId: z.uuid().nullable(),
    active: z.boolean(),
  })
  .partial();
export type MachineModelUpdate = z.infer<typeof MachineModelUpdate>;
export const ZoneUpdate = z
  .strictObject({
    name: z.string().trim().min(1).max(60),
    active: z.boolean(),
  })
  .partial();
export type ZoneUpdate = z.infer<typeof ZoneUpdate>;
export const ZoneList = z.object({ zones: z.array(ZoneDto) });
export type ZoneList = z.infer<typeof ZoneList>;
export type BinBulkResult = z.infer<typeof BinBulkResult>;
export type SupersedeInput = z.infer<typeof SupersedeInput>;
export type ItemStatusInput = z.infer<typeof ItemStatusInput>;

export const SPECIAL_ZONE_CODE = 'X';
export const ITEM_CSV_MAX_ROWS = 5000;
export const ITEM_CSV_MAX_BYTES = 2 * 1024 * 1024;
export const QR_TOKEN_PATTERN = /^[A-Za-z0-9]{12}$/;

export const InventorySummary = z.object({
  items: z.int(),
  belowMin: z.int(),
  inStock: z.int(),
  bins: z.int(),
  zones: z.int(),
  brands: z.int(),
});
export type InventorySummary = z.infer<typeof InventorySummary>;
