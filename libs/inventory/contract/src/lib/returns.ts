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
const DocRef = z.object({ id: z.uuid(), number: z.string().nullable() });
const BinRef = z.object({ id: z.uuid(), code: z.string() });
const Stamp = z
  .object({ by: z.string().nullable(), at: z.string() })
  .nullable();
const PositiveQty = Qty.refine((q) => Number(q) > 0, 'Must be more than 0');

export const RETURN_STATUSES = ['DRAFT', 'POSTED', 'CANCELLED'] as const;
export const RETURN_CONDITIONS = ['GOOD', 'DAMAGED', 'FAULTY'] as const;
export const RETURN_REASON_MIN = 5;

export const ReturnLineInput = z
  .strictObject({
    aodLineId: z.uuid().nullable().optional(),
    itemId: z.uuid(),
    qty: PositiveQty,
    condition: z.enum(RETURN_CONDITIONS),
    binId: z.uuid().nullable().optional(),
    serialNo: OptionalText(60),
    notes: OptionalText(500),
  })
  .superRefine((line, ctx) => {
    if (line.condition === 'GOOD' && !line.binId) {
      ctx.addIssue({
        code: 'custom',
        path: ['binId'],
        message: 'Choose the bin it goes back to',
      });
    }
    if (line.condition === 'FAULTY' && !line.notes) {
      ctx.addIssue({
        code: 'custom',
        path: ['notes'],
        message: 'Describe the fault',
      });
    }
  });
export type ReturnLineInput = z.infer<typeof ReturnLineInput>;

const returnHeader = {
  departmentId: z.uuid().nullable().optional(),
  customerId: z.uuid().nullable().optional(),
  jobNumber: OptionalText(40),
  reason: OptionalText(300),
  notes: OptionalText(1000),
};

export const ReturnInput = z
  .strictObject({
    aodId: z.uuid().nullable().optional(),
    ...returnHeader,
    lines: z.array(ReturnLineInput).min(1).max(200),
  })
  .superRefine((input, ctx) => {
    if (input.aodId) return;
    if (!input.departmentId) {
      ctx.addIssue({
        code: 'custom',
        path: ['departmentId'],
        message: 'Choose the department returning the parts',
      });
    }
    if ((input.reason ?? '').length < RETURN_REASON_MIN) {
      ctx.addIssue({
        code: 'custom',
        path: ['reason'],
        message: `Give a reason of at least ${RETURN_REASON_MIN} characters`,
      });
    }
  });
export type ReturnInput = z.infer<typeof ReturnInput>;

export const ReturnUpdate = z.strictObject({
  version: z.int(),
  ...returnHeader,
  lines: z.array(ReturnLineInput).min(1).max(200).optional(),
});
export type ReturnUpdate = z.infer<typeof ReturnUpdate>;

export const ReturnTransition = z.strictObject({ version: z.int() });

export const ReturnSummary = z.object({
  id: z.uuid(),
  number: z.string().nullable(),
  status: z.enum(RETURN_STATUSES),
  aod: DocRef.nullable(),
  department: Ref,
  customer: Ref.nullable().optional(),
  jobNumber: z.string().nullable(),
  lineCount: z.int(),
  createdAt: z.string(),
  postedAt: z.string().nullable(),
});
export type ReturnSummary = z.infer<typeof ReturnSummary>;
export const ReturnPage = pageOf(ReturnSummary);
export type ReturnPage = z.infer<typeof ReturnPage>;

export const ReturnLineDto = z.object({
  id: z.uuid(),
  lineNo: z.int(),
  aodLineId: z.uuid().nullable(),
  item: ItemRef,
  qty: z.string(),
  condition: z.enum(RETURN_CONDITIONS),
  bin: BinRef.nullable(),
  serialNo: z.string().nullable(),
  notes: z.string().nullable(),
  warrantyTag: z.object({ id: z.uuid(), number: z.string() }).nullable(),
  issued: z.string().nullable(),
  returnedElsewhere: z.string().nullable(),
});
export type ReturnLineDto = z.infer<typeof ReturnLineDto>;

export const ReturnDto = ReturnSummary.extend({
  reason: z.string().nullable(),
  notes: z.string().nullable(),
  posted: Stamp,
  version: z.int(),
  lines: z.array(ReturnLineDto),
});
export type ReturnDto = z.infer<typeof ReturnDto>;

export const ReturnQuery = PageQuery.extend({
  status: z.enum([...RETURN_STATUSES, 'ALL']).default('ALL'),
});
export type ReturnQuery = z.infer<typeof ReturnQuery>;

export const ReturnableAodLine = z.object({
  aodLineId: z.uuid(),
  item: ItemRef,
  pickedFrom: BinRef.nullable(),
  defaultBin: BinRef.nullable(),
  issued: z.string(),
  returned: z.string(),
  returnable: z.string(),
});
export type ReturnableAodLine = z.infer<typeof ReturnableAodLine>;

export const ReturnableAod = z.object({
  id: z.uuid(),
  number: z.string().nullable(),
  status: z.string(),
  open: z.boolean(),
  mrn: DocRef,
  department: Ref,
  customer: Ref.nullable().optional(),
  jobNumber: z.string().nullable(),
  issuedAt: z.string().nullable(),
  lines: z.array(ReturnableAodLine),
});
export type ReturnableAod = z.infer<typeof ReturnableAod>;

export const ReturnAodQuery = z.object({
  q: z.string().trim().max(100).optional(),
});
export type ReturnAodQuery = z.infer<typeof ReturnAodQuery>;

export const ReturnAodOption = z.object({
  id: z.uuid(),
  number: z.string().nullable(),
  department: z.string(),
  customer: z.string().nullable().optional(),
  jobNumber: z.string().nullable(),
  issuedAt: z.string().nullable(),
});
export const ReturnAodOptions = z.object({ items: z.array(ReturnAodOption) });
export type ReturnAodOptions = z.infer<typeof ReturnAodOptions>;

export const ReturnsSummary = z.object({ drafts: z.int() });
export type ReturnsSummary = z.infer<typeof ReturnsSummary>;
