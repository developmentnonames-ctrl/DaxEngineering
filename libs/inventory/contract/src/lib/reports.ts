import { z } from 'zod';
import { PageParams, pageOf } from '@dax/contracts';
import { BIN_KINDS } from './dto';
import { MOVEMENT_TYPES, MovementRow } from './receiving';

export const REPORT_ROW_LIMIT = 2000;
export const REPORT_CSV_ROW_LIMIT = 50_000;
export const REPORT_DOC_TYPES = ['GRN', 'AOD', 'RTN', 'CNT', 'WTY'] as const;
export const SLOW_MOVING_DAYS = ['30', '60', '90', '180', '365'] as const;

export const REPORT_MOVEMENT_LABELS: Record<
  (typeof MOVEMENT_TYPES)[number],
  string
> = {
  RECEIVE: 'Received',
  RECEIVE_DAMAGED: 'Received damaged',
  PUTAWAY_OUT: 'Put away from',
  PUTAWAY_IN: 'Put away to',
  REVERSAL: 'Reversed',
  ISSUE: 'Issued from',
  RETURN: 'Returned to',
  COUNT_ADJUST: 'Count adjustment',
  OPENING: 'Opening stock',
};

export const REPORT_DOC_LABELS: Record<
  (typeof REPORT_DOC_TYPES)[number],
  string
> = {
  GRN: 'Goods received notes',
  AOD: 'Advice of dispatch',
  RTN: 'Return notes',
  CNT: 'Stock counts',
  WTY: 'Warranty tags',
};

export const REPORT_BIN_KIND_LABELS: Record<
  (typeof BIN_KINDS)[number],
  string
> = {
  STORAGE: 'Storage',
  RECEIVING: 'Receiving',
  QUARANTINE: 'Quarantine',
  WARRANTY: 'Warranty',
};

const ReportDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const ReportItem = z.object({
  id: z.uuid(),
  partNo: z.string(),
  brand: z.string(),
  description: z.string(),
  uom: z.string(),
});

export const BelowMinRow = z.object({
  item: ReportItem,
  minQty: z.string(),
  onHand: z.string(),
  held: z.string(),
  free: z.string(),
  shortBy: z.string(),
  waiting: z.string(),
});
export type BelowMinRow = z.infer<typeof BelowMinRow>;
export const BelowMinReport = z.object({
  items: z.array(BelowMinRow),
  truncated: z.boolean(),
});
export type BelowMinReport = z.infer<typeof BelowMinReport>;

export const MovementReportQuery = PageParams.extend({
  from: ReportDay.optional(),
  to: ReportDay.optional(),
  itemId: z.uuid().optional(),
  binId: z.uuid().optional(),
  movement: z.enum(MOVEMENT_TYPES).optional(),
  docType: z.enum(REPORT_DOC_TYPES).optional(),
}).refine((q) => !q.from || !q.to || q.from <= q.to, {
  message: 'The start date must be on or before the end date.',
  path: ['to'],
});
export type MovementReportQuery = z.infer<typeof MovementReportQuery>;

export const MovementReportRow = MovementRow.extend({
  item: ReportItem.pick({ id: true, partNo: true, uom: true }),
});
export type MovementReportRow = z.infer<typeof MovementReportRow>;
export const MovementReportPage = pageOf(MovementReportRow).extend({
  filterItem: z.object({ id: z.uuid(), label: z.string() }).nullable(),
  filterBin: z.object({ id: z.uuid(), label: z.string() }).nullable(),
});
export type MovementReportPage = z.infer<typeof MovementReportPage>;

export const BinStockQuery = z.object({
  zoneId: z.uuid().optional(),
  kind: z.enum(BIN_KINDS).optional(),
});
export type BinStockQuery = z.infer<typeof BinStockQuery>;

export const BinStockBin = z.object({
  id: z.uuid(),
  code: z.string(),
  kind: z.enum(BIN_KINDS),
  zone: z.object({ id: z.uuid(), code: z.string(), name: z.string() }),
  beingCounted: z.boolean(),
  lines: z.array(z.object({ item: ReportItem, qty: z.string() })),
});
export type BinStockBin = z.infer<typeof BinStockBin>;
export const BinStockReport = z.object({
  bins: z.array(BinStockBin),
  truncated: z.boolean(),
});
export type BinStockReport = z.infer<typeof BinStockReport>;

export const SlowMovingQuery = z.object({
  days: z.enum(SLOW_MOVING_DAYS).default('90'),
});
export type SlowMovingQuery = z.infer<typeof SlowMovingQuery>;

export const SlowMovingRow = z.object({
  item: ReportItem,
  onHand: z.string(),
  lastIssuedAt: z.string().nullable(),
  lastReceivedAt: z.string().nullable(),
  daysSinceIssue: z.int().nullable(),
});
export type SlowMovingRow = z.infer<typeof SlowMovingRow>;
export const SlowMovingReport = z.object({
  items: z.array(SlowMovingRow),
  truncated: z.boolean(),
});
export type SlowMovingReport = z.infer<typeof SlowMovingReport>;
