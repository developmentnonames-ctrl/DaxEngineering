import { z } from 'zod';
import { OptionalText, PageQuery, pageOf, Qty } from '@dax/contracts';

const ItemRef = z.object({
  id: z.uuid(),
  partNo: z.string(),
  brand: z.string(),
  description: z.string(),
  uom: z.string(),
});
const Stamp = z
  .object({ by: z.string().nullable(), at: z.string() })
  .nullable();
const Reason = z.string().trim().min(5).max(300);

export const COUNT_KINDS = ['CYCLE', 'FULL', 'OPENING'] as const;
export const COUNT_STATUSES = [
  'COUNTING',
  'SUBMITTED',
  'POSTED',
  'CANCELLED',
] as const;

export const CountCreate = z.strictObject({
  kind: z.enum(COUNT_KINDS),
  blind: z.boolean().default(false),
  notes: OptionalText(1000),
  zoneIds: z.array(z.uuid()).max(200).default([]),
  binIds: z.array(z.uuid()).max(5000).default([]),
});
export type CountCreate = z.infer<typeof CountCreate>;

export const CountEntry = z.strictObject({
  version: z.int(),
  lines: z
    .array(z.strictObject({ lineId: z.uuid(), countedQty: Qty.nullable() }))
    .min(1)
    .max(500),
});
export type CountEntry = z.infer<typeof CountEntry>;

export const CountAddLine = z.strictObject({
  version: z.int(),
  binId: z.uuid(),
  itemId: z.uuid(),
  countedQty: Qty,
});
export type CountAddLine = z.infer<typeof CountAddLine>;

export const CountTransition = z.strictObject({ version: z.int() });
export type CountTransition = z.infer<typeof CountTransition>;

export const CountReason = z.strictObject({ version: z.int(), reason: Reason });
export type CountReason = z.infer<typeof CountReason>;

export const CountSummary = z.object({
  id: z.uuid(),
  number: z.string(),
  kind: z.enum(COUNT_KINDS),
  status: z.enum(COUNT_STATUSES),
  blind: z.boolean(),
  lineCount: z.int(),
  countedLines: z.int(),
  createdBy: z.string().nullable(),
  createdAt: z.string(),
});
export type CountSummary = z.infer<typeof CountSummary>;
export const CountPage = pageOf(CountSummary);
export type CountPage = z.infer<typeof CountPage>;
export const CountQuery = PageQuery.extend({
  status: z.enum([...COUNT_STATUSES, 'OPEN', 'ALL']).default('OPEN'),
  kind: z.enum(COUNT_KINDS).optional(),
});
export type CountQuery = z.infer<typeof CountQuery>;

export const CountLineDto = z.object({
  id: z.uuid(),
  item: ItemRef,
  systemQty: z.string().optional(),
  countedQty: z.string().nullable(),
  difference: z.string().nullable().optional(),
  counted: Stamp,
  added: z.boolean(),
});
export type CountLineDto = z.infer<typeof CountLineDto>;

export const CountBinDto = z.object({
  id: z.uuid(),
  code: z.string(),
  lineCount: z.int(),
  countedLines: z.int(),
  lines: z.array(CountLineDto),
});
export type CountBinDto = z.infer<typeof CountBinDto>;

export const CountDto = CountSummary.extend({
  notes: z.string().nullable(),
  version: z.int(),
  systemVisible: z.boolean(),
  tookPart: z.boolean(),
  submitted: Stamp,
  sentBack: Stamp,
  sendBackReason: z.string().nullable(),
  approved: Stamp,
  cancelled: Stamp,
  cancelReason: z.string().nullable(),
  bins: z.array(CountBinDto),
});
export type CountDto = z.infer<typeof CountDto>;

export const CountScopeBin = z.object({
  id: z.uuid(),
  code: z.string(),
  kind: z.enum(['STORAGE', 'QUARANTINE']),
  itemCount: z.int(),
  opened: z.boolean(),
  countNumber: z.string().nullable(),
});
export type CountScopeBin = z.infer<typeof CountScopeBin>;
export const CountScope = z.object({
  zones: z.array(
    z.object({
      id: z.uuid(),
      code: z.string(),
      name: z.string(),
      bins: z.array(CountScopeBin),
    }),
  ),
});
export type CountScope = z.infer<typeof CountScope>;
