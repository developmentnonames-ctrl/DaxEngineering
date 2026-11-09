import { z } from 'zod';
import { OptionalText, PageQuery, pageOf, Qty } from '@dax/contracts';

const IsoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const ItemRef = z.object({
  id: z.uuid(),
  partNo: z.string(),
  brand: z.string(),
  description: z.string(),
  uom: z.string(),
});
const PartyRef = z.object({ id: z.uuid(), name: z.string() });
const Stamp = z
  .object({ by: z.string().nullable(), at: z.string() })
  .nullable();

export const GRN_STATUSES = [
  'DRAFT',
  'CHECKED',
  'POSTED',
  'PUT_AWAY',
  'CANCELLED',
  'REVERSED',
] as const;
export const GRN_SUBTYPES = ['FOR', 'LOC'] as const;
export const DISCREPANCY_KINDS = [
  'SHORT',
  'EXCESS',
  'DAMAGED',
  'WRONG_ITEM',
] as const;
export const MOVEMENT_TYPES = [
  'RECEIVE',
  'RECEIVE_DAMAGED',
  'PUTAWAY_OUT',
  'PUTAWAY_IN',
  'REVERSAL',
  'ISSUE',
] as const;

export const GrnCreate = z.strictObject({
  supplierId: z.uuid(),
  deliveryNote: OptionalText(60),
  deliveryDate: IsoDay.nullable().optional(),
});
export type GrnCreate = z.infer<typeof GrnCreate>;

export const GrnLineInput = z.strictObject({
  id: z.uuid().optional(),
  itemId: z.uuid(),
  qtyExpected: Qty.nullable().optional(),
  qtyGood: Qty.default('0'),
  qtyDamaged: Qty.default('0'),
  wrongItem: z.boolean().default(false),
  notes: OptionalText(300),
});
export type GrnLineInput = z.infer<typeof GrnLineInput>;
export const GrnUpdate = z.strictObject({
  version: z.int(),
  subtype: z.enum(GRN_SUBTYPES).optional(),
  deliveryNote: OptionalText(60),
  deliveryDate: IsoDay.nullable().optional(),
  notes: OptionalText(1000),
  lines: z.array(GrnLineInput).max(300).optional(),
});
export type GrnUpdate = z.infer<typeof GrnUpdate>;
export const GrnTransition = z.strictObject({ version: z.int() });
export const GrnReverseInput = z.strictObject({
  version: z.int(),
  reason: z.string().trim().min(5).max(300),
});

export const GrnSummary = z.object({
  id: z.uuid(),
  number: z.string().nullable(),
  subtype: z.enum(GRN_SUBTYPES),
  status: z.enum(GRN_STATUSES),
  supplier: PartyRef,
  lineCount: z.int(),
  openDiscrepancies: z.int(),
  createdAt: z.string(),
  postedAt: z.string().nullable(),
});
export type GrnSummary = z.infer<typeof GrnSummary>;
export const GrnPage = pageOf(GrnSummary);
export type GrnPage = z.infer<typeof GrnPage>;
export const GrnDto = GrnSummary.extend({
  deliveryNote: z.string().nullable(),
  deliveryDate: z.string().nullable(),
  notes: z.string().nullable(),
  checked: Stamp,
  posted: Stamp,
  reversed: Stamp.and(
    z.object({ reason: z.string().nullable() }).partial(),
  ).nullable(),
  version: z.int(),
  lines: z.array(
    z.object({
      id: z.uuid(),
      lineNo: z.int(),
      item: ItemRef,
      qtyExpected: z.string().nullable(),
      qtyGood: z.string(),
      qtyDamaged: z.string(),
      qtyPutAway: z.string(),
      toPutAway: z.string(),
      wrongItem: z.boolean(),
      notes: z.string().nullable(),
      defaultBin: z.object({ id: z.uuid(), code: z.string() }).nullable(),
    }),
  ),
  discrepancies: z.array(
    z.object({
      id: z.uuid(),
      kind: z.enum(DISCREPANCY_KINDS),
      qty: z.string(),
      status: z.enum(['OPEN', 'CLOSED']),
      itemId: z.uuid(),
    }),
  ),
});
export type GrnDto = z.infer<typeof GrnDto>;
export const GrnQuery = PageQuery.extend({
  status: z.enum([...GRN_STATUSES, 'OPEN', 'ALL']).default('OPEN'),
});
export type GrnQuery = z.infer<typeof GrnQuery>;

export const PutawayInput = z.strictObject({
  moves: z
    .array(
      z.strictObject({
        grnLineId: z.uuid(),
        binId: z.uuid(),
        qty: Qty.refine((q) => Number(q) > 0, 'Must be more than 0'),
      }),
    )
    .min(1)
    .max(300),
});
export type PutawayInput = z.infer<typeof PutawayInput>;
export const PutawayRow = z.object({
  grn: z.object({ id: z.uuid(), number: z.string() }),
  grnLineId: z.uuid(),
  item: ItemRef,
  toPutAway: z.string(),
  defaultBin: z.object({ id: z.uuid(), code: z.string() }).nullable(),
  postedAt: z.string(),
});
export type PutawayRow = z.infer<typeof PutawayRow>;
export const PutawayList = z.object({ rows: z.array(PutawayRow) });
export type PutawayList = z.infer<typeof PutawayList>;

export const DiscrepancyDto = z.object({
  id: z.uuid(),
  grn: z.object({ id: z.uuid(), number: z.string().nullable() }),
  supplier: PartyRef,
  item: ItemRef,
  kind: z.enum(DISCREPANCY_KINDS),
  qty: z.string(),
  status: z.enum(['OPEN', 'CLOSED']),
  notes: z.string().nullable(),
  closeNote: z.string().nullable(),
  createdAt: z.string(),
  closed: Stamp,
  version: z.int(),
});
export type DiscrepancyDto = z.infer<typeof DiscrepancyDto>;
export const DiscrepancyPage = pageOf(DiscrepancyDto);
export type DiscrepancyPage = z.infer<typeof DiscrepancyPage>;
export const DiscrepancyQuery = PageQuery.extend({
  status: z.enum(['OPEN', 'CLOSED', 'ALL']).default('OPEN'),
});
export type DiscrepancyQuery = z.infer<typeof DiscrepancyQuery>;
export const DiscrepancyNotes = z.strictObject({
  version: z.int(),
  notes: OptionalText(1000),
});
export const DiscrepancyClose = z.strictObject({
  version: z.int(),
  note: z.string().trim().min(3).max(500),
});

export const MovementRow = z.object({
  id: z.uuid(),
  occurredAt: z.string(),
  bin: z.object({ id: z.uuid(), code: z.string() }),
  qty: z.string(),
  binQtyAfter: z.string(),
  movement: z.enum(MOVEMENT_TYPES),
  docType: z.string(),
  docId: z.uuid(),
  docNumber: z.string().nullable(),
  actor: z.string().nullable(),
});
export type MovementRow = z.infer<typeof MovementRow>;
export const MovementPage = pageOf(MovementRow);
export type MovementPage = z.infer<typeof MovementPage>;

export const ReceivingSummary = z.object({
  drafts: z.int(),
  awaitingPutaway: z.int(),
  openDiscrepancies: z.int(),
});
export type ReceivingSummary = z.infer<typeof ReceivingSummary>;
export const MovementQuery = PageQuery.pick({ cursor: true, limit: true });
export type MovementQuery = z.infer<typeof MovementQuery>;
