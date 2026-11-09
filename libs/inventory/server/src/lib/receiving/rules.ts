import type { Prisma } from '@dax/platform-db';
import { conflict } from '../common';
import { dec, type DecimalLike, qtyString } from '../stock-math';

export type GrnStatus =
  'DRAFT' | 'CHECKED' | 'POSTED' | 'PUT_AWAY' | 'CANCELLED' | 'REVERSED';
export type DiscrepancyKind = 'SHORT' | 'EXCESS' | 'DAMAGED' | 'WRONG_ITEM';
export type GrnAction =
  'edit' | 'check' | 'post' | 'cancel' | 'reverse' | 'putaway';

export const GRN_ALLOWED_FROM: Record<GrnAction, GrnStatus[]> = {
  edit: ['DRAFT', 'CHECKED'],
  check: ['DRAFT'],
  post: ['CHECKED'],
  cancel: ['DRAFT', 'CHECKED'],
  reverse: ['POSTED', 'PUT_AWAY'],
  putaway: ['POSTED'],
};

export const OPEN_GRN_STATUSES: GrnStatus[] = ['DRAFT', 'CHECKED', 'POSTED'];
export const UNPOSTED_GRN_STATUSES: GrnStatus[] = ['DRAFT', 'CHECKED'];

function refusal(action: GrnAction, status: GrnStatus): string {
  if (status === 'CANCELLED') return 'This GRN has been cancelled.';
  if (status === 'REVERSED') return 'This GRN has been reversed.';
  switch (action) {
    case 'edit':
      return 'A posted GRN can no longer be changed.';
    case 'check':
      return status === 'CHECKED'
        ? 'This GRN is already checked.'
        : 'A posted GRN can no longer be checked.';
    case 'post':
      return status === 'DRAFT'
        ? 'Check the GRN before posting it.'
        : 'This GRN is already posted.';
    case 'cancel':
      return "A posted GRN can't be cancelled. Reverse it instead.";
    case 'reverse':
      return 'Only a posted GRN can be reversed.';
    case 'putaway':
      return status === 'PUT_AWAY'
        ? 'Everything on this GRN has already been put away.'
        : 'Post the GRN before putting its stock away.';
  }
}

export function assertGrnAction(action: GrnAction, status: GrnStatus): void {
  if (!GRN_ALLOWED_FROM[action].includes(status)) {
    conflict('INVALID_STATE', refusal(action, status));
  }
}

export interface ReceivedLine {
  qtyExpected: DecimalLike | null;
  qtyGood: DecimalLike;
  qtyDamaged: DecimalLike;
  wrongItem: boolean;
}

export interface DiscrepancyDraft {
  kind: DiscrepancyKind;
  qty: string;
}

export function receivedQty(line: ReceivedLine): Prisma.Decimal {
  return dec(line.qtyGood).plus(dec(line.qtyDamaged));
}

export function lineDiscrepancies(line: ReceivedLine): DiscrepancyDraft[] {
  const out: DiscrepancyDraft[] = [];
  const received = receivedQty(line);
  if (!line.wrongItem && line.qtyExpected !== null) {
    const gap = dec(line.qtyExpected).minus(received);
    if (gap.gt(0)) out.push({ kind: 'SHORT', qty: qtyString(gap) });
    if (gap.lt(0)) out.push({ kind: 'EXCESS', qty: qtyString(gap.neg()) });
  }
  const damaged = dec(line.qtyDamaged);
  if (damaged.gt(0)) out.push({ kind: 'DAMAGED', qty: qtyString(damaged) });
  if (line.wrongItem) {
    out.push({ kind: 'WRONG_ITEM', qty: qtyString(wrongItemQty(line)) });
  }
  return out;
}

// A refused wrong item has no received quantity, so it counts the delivery-note quantity, else one.
function wrongItemQty(line: ReceivedLine): Prisma.Decimal {
  const received = receivedQty(line);
  if (received.gt(0)) return received;
  if (line.qtyExpected !== null && dec(line.qtyExpected).gt(0))
    return dec(line.qtyExpected);
  return dec(1);
}

export function hasSomethingReceived(lines: readonly ReceivedLine[]): boolean {
  return lines.some((l) => l.wrongItem || receivedQty(l).gt(0));
}

export function outstanding(
  expected: DecimalLike,
  received: DecimalLike,
): Prisma.Decimal {
  const left = dec(expected).minus(dec(received));
  return left.gt(0) ? left : dec(0);
}

export function toPutAway(
  qtyGood: DecimalLike,
  qtyPutAway: DecimalLike,
): Prisma.Decimal {
  return outstanding(qtyGood, qtyPutAway);
}

export function isFullyPutAway(
  lines: readonly { qtyGood: DecimalLike; qtyPutAway: DecimalLike }[],
): boolean {
  return lines.every((l) => toPutAway(l.qtyGood, l.qtyPutAway).isZero());
}

export function putawayOverLimit(
  moves: readonly { grnLineId: string; qty: DecimalLike }[],
  remaining: ReadonlyMap<string, Prisma.Decimal>,
): string | null {
  const totals = new Map<string, Prisma.Decimal>();
  for (const m of moves) {
    totals.set(
      m.grnLineId,
      (totals.get(m.grnLineId) ?? dec(0)).plus(dec(m.qty)),
    );
  }
  for (const [lineId, total] of totals) {
    if (total.gt(remaining.get(lineId) ?? dec(0))) return lineId;
  }
  return null;
}
