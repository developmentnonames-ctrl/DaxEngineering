import { z } from 'zod';
import { OptionalText, PageQuery, pageOf, Qty } from '@dax/contracts';

const ItemRef = z.object({
  id: z.uuid(),
  partNo: z.string(),
  brand: z.string(),
  description: z.string(),
  uom: z.string(),
});
const Ref = z.object({ id: z.uuid(), name: z.string() });
const Stamp = z
  .object({ by: z.string().nullable(), at: z.string() })
  .nullable();
const PositiveQty = Qty.refine((q) => Number(q) > 0, 'Must be more than 0');

export const WARRANTY_STATUSES = ['TAGGED', 'SENT', 'CLOSED'] as const;
export const WARRANTY_OUTCOMES = [
  'REPLACED',
  'CREDITED',
  'REJECTED',
  'RETURNED_TO_CUSTOMER',
  'SCRAPPED',
] as const;
export const WARRANTY_NOTE_REQUIRED: readonly WarrantyOutcome[] = [
  'REJECTED',
  'SCRAPPED',
];
export type WarrantyStatus = (typeof WARRANTY_STATUSES)[number];
export type WarrantyOutcome = (typeof WARRANTY_OUTCOMES)[number];

const tagFields = {
  itemId: z.uuid(),
  qty: PositiveQty,
  serialNo: OptionalText(60),
  machineModelId: z.uuid().nullable().optional(),
  machineSerial: OptionalText(60),
  jobNumber: OptionalText(40),
  customerId: z.uuid().nullable().optional(),
  fault: z.string().trim().min(5, 'Describe the fault').max(1000),
  supplierId: z.uuid().nullable().optional(),
  claimNumber: OptionalText(60),
};

export const WarrantyTagInput = z.strictObject({
  ...tagFields,
  qty: PositiveQty.default('1'),
});
export type WarrantyTagInput = z.infer<typeof WarrantyTagInput>;
export const WarrantyTagUpdate = z
  .strictObject(tagFields)
  .partial()
  .extend({ version: z.int() });
export type WarrantyTagUpdate = z.infer<typeof WarrantyTagUpdate>;
export const WarrantySend = z.strictObject({
  version: z.int(),
  supplierId: z.uuid(),
  claimNumber: OptionalText(60),
});
export type WarrantySend = z.infer<typeof WarrantySend>;
export const WarrantyClose = z
  .strictObject({
    version: z.int(),
    outcome: z.enum(WARRANTY_OUTCOMES),
    note: OptionalText(500),
  })
  .refine((v) => !WARRANTY_NOTE_REQUIRED.includes(v.outcome) || !!v.note, {
    message: 'Say why in the closing note',
    path: ['note'],
  });
export type WarrantyClose = z.infer<typeof WarrantyClose>;

export const WarrantySummary = z.object({
  id: z.uuid(),
  number: z.string(),
  status: z.enum(WARRANTY_STATUSES),
  item: ItemRef,
  qty: z.string(),
  serialNo: z.string().nullable(),
  jobNumber: z.string().nullable(),
  customer: Ref.nullable().optional(),
  supplier: Ref.nullable(),
  claimNumber: z.string().nullable(),
  outcome: z.enum(WARRANTY_OUTCOMES).nullable(),
  createdAt: z.string(),
});
export type WarrantySummary = z.infer<typeof WarrantySummary>;
export const WarrantyPage = pageOf(WarrantySummary);
export type WarrantyPage = z.infer<typeof WarrantyPage>;
export const WarrantyDto = WarrantySummary.extend({
  machineModel: Ref.nullable(),
  machineSerial: z.string().nullable(),
  fault: z.string(),
  bin: z.object({ id: z.uuid(), code: z.string() }),
  returnNote: z
    .object({ id: z.uuid(), number: z.string().nullable() })
    .nullable(),
  created: Stamp,
  sent: Stamp,
  closed: Stamp,
  closeNote: z.string().nullable(),
  version: z.int(),
});
export type WarrantyDto = z.infer<typeof WarrantyDto>;
export const WarrantyQuery = PageQuery.extend({
  status: z.enum([...WARRANTY_STATUSES, 'OPEN', 'ALL']).default('OPEN'),
});
export type WarrantyQuery = z.infer<typeof WarrantyQuery>;
export const WarrantyCounts = z.object({
  tagged: z.int(),
  sent: z.int(),
});
export type WarrantyCounts = z.infer<typeof WarrantyCounts>;
