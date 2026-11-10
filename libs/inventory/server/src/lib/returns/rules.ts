import { RETURN_REASON_MIN } from '@dax/inventory-contract';
import type { Prisma } from '@dax/platform-db';
import { conflict, invalid } from '../common';
import { dec, type DecimalLike, qtyString } from '../stock-math';

export type ReturnStatus = 'DRAFT' | 'POSTED' | 'CANCELLED';
export type ReturnCondition = 'GOOD' | 'DAMAGED' | 'FAULTY';
export type ReturnAction = 'edit' | 'post' | 'cancel';

export const RETURNABLE_AOD_STATUSES = ['ISSUED', 'SIGNED'] as const;

const REFUSALS: Record<ReturnAction, string> = {
  edit: 'Only a draft return can be changed.',
  post: 'Only a draft return can be posted.',
  cancel: 'Only a draft return can be cancelled.',
};

export function assertReturnAction(
  action: ReturnAction,
  status: ReturnStatus,
): void {
  if (status !== 'DRAFT') conflict('INVALID_STATE', REFUSALS[action]);
}

export function isReturnableAod(status: string): boolean {
  return (RETURNABLE_AOD_STATUSES as readonly string[]).includes(status);
}

export function assertReturnableAod(status: string): void {
  if (!isReturnableAod(status)) {
    conflict(
      'INVALID_STATE',
      'Parts can only be returned against an issued AOD.',
    );
  }
}

export function returnableQty(
  issued: DecimalLike,
  returned: DecimalLike,
): Prisma.Decimal {
  const left = dec(issued).minus(dec(returned));
  return left.gt(0) ? left : dec(0);
}

export function sumByAodLine(
  lines: readonly { aodLineId: string | null; qty: DecimalLike }[],
): Map<string, Prisma.Decimal> {
  const totals = new Map<string, Prisma.Decimal>();
  for (const l of lines) {
    if (!l.aodLineId) continue;
    totals.set(
      l.aodLineId,
      (totals.get(l.aodLineId) ?? dec(0)).plus(dec(l.qty)),
    );
  }
  return totals;
}

export function overReturned(
  lines: readonly { aodLineId: string | null; qty: DecimalLike }[],
  returnable: ReadonlyMap<string, Prisma.Decimal>,
): string | null {
  for (const [aodLineId, total] of sumByAodLine(lines)) {
    if (total.gt(returnable.get(aodLineId) ?? dec(0))) return aodLineId;
  }
  return null;
}

export function overReturnFor(partNo: string, left: DecimalLike): never {
  conflict(
    'OVER_RETURN',
    dec(left).isZero()
      ? `Everything of ${partNo} on this AOD has already been returned.`
      : `Only ${qtyString(left)} of ${partNo} can still be returned from this AOD.`,
  );
}

export function binFor(
  condition: ReturnCondition,
  chosenBinId: string | null | undefined,
  quarantineBinId: string,
  field: string,
): string | null {
  if (condition === 'FAULTY') return null;
  if (condition === 'DAMAGED') return quarantineBinId;
  if (!chosenBinId) invalid('Choose the bin it goes back to.', [field]);
  return chosenBinId;
}

export function checkFreeReason(reason: string | null | undefined): void {
  if ((reason ?? '').trim().length < RETURN_REASON_MIN) {
    invalid(
      `Give a reason of at least ${RETURN_REASON_MIN} characters for a return without an AOD.`,
      ['reason'],
    );
  }
}

export function checkFault(
  condition: ReturnCondition,
  notes: string | null | undefined,
  field: string,
): void {
  if (condition === 'FAULTY' && !(notes ?? '').trim()) {
    invalid('Describe the fault for a faulty part.', [field]);
  }
}

export function movesStock(condition: ReturnCondition): boolean {
  return condition !== 'FAULTY';
}
