import type { Prisma } from '@dax/platform-db';
import { conflict } from '../common';
import { dec, type DecimalLike } from '../stock-math';

export type CountKind = 'CYCLE' | 'FULL' | 'OPENING';
export type CountStatus = 'COUNTING' | 'SUBMITTED' | 'POSTED' | 'CANCELLED';
export type CountAction =
  'count' | 'submit' | 'approve' | 'send_back' | 'cancel';
export type BinKind = 'STORAGE' | 'RECEIVING' | 'QUARANTINE' | 'WARRANTY';

export const COUNT_ALLOWED_FROM: Record<CountAction, CountStatus[]> = {
  count: ['COUNTING'],
  submit: ['COUNTING'],
  approve: ['SUBMITTED'],
  send_back: ['SUBMITTED'],
  cancel: ['COUNTING', 'SUBMITTED'],
};

export const OPEN_COUNT_STATUSES: CountStatus[] = ['COUNTING', 'SUBMITTED'];
export const COUNTABLE_BIN_KINDS: BinKind[] = ['STORAGE', 'QUARANTINE'];

const REFUSALS: Record<CountAction, string> = {
  count: 'This count is no longer open for counting.',
  submit: 'Only a count in progress can be submitted.',
  approve: 'Only a submitted count can be approved.',
  send_back: 'Only a submitted count can be sent back.',
  cancel: 'This count is already posted or cancelled.',
};

export function assertCountAction(
  action: CountAction,
  status: CountStatus,
): void {
  if (!COUNT_ALLOWED_FROM[action].includes(status)) {
    conflict('INVALID_STATE', REFUSALS[action]);
  }
}

export interface ScopeBin {
  kind: BinKind;
  active: boolean;
  openedAt: Date | null;
}

export type Ineligible = 'INACTIVE' | 'KIND' | 'OPENED';

export function ineligibility(
  bin: ScopeBin,
  kind: CountKind,
): Ineligible | null {
  if (!bin.active) return 'INACTIVE';
  if (!COUNTABLE_BIN_KINDS.includes(bin.kind)) return 'KIND';
  if (kind === 'OPENING' && bin.openedAt) return 'OPENED';
  return null;
}

export function ineligibleMessage(code: string, reason: Ineligible): string {
  if (reason === 'INACTIVE') return `Bin ${code} is not active.`;
  if (reason === 'KIND')
    return `Bin ${code} can't be counted. Only storage and quarantine bins are counted.`;
  return `Bin ${code} has already had its opening count.`;
}

export function difference(
  counted: DecimalLike,
  current: DecimalLike,
): Prisma.Decimal {
  return dec(counted).minus(dec(current));
}

export function tookPart(
  userId: string,
  submittedBy: string | null,
  countedBy: readonly (string | null)[],
): boolean {
  return submittedBy === userId || countedBy.includes(userId);
}

export function assertNotSelfApproval(
  userId: string,
  submittedBy: string | null,
  countedBy: readonly (string | null)[],
): void {
  if (tookPart(userId, submittedBy, countedBy)) {
    conflict(
      'SELF_APPROVAL',
      'Another Stores Manager must approve this count, because you counted or submitted it.',
    );
  }
}

export function seesSystemQty(
  blind: boolean,
  status: CountStatus,
  canApprove: boolean,
): boolean {
  return canApprove || !blind || !OPEN_COUNT_STATUSES.includes(status);
}

export function uncounted(
  lines: readonly { countedQty: DecimalLike | null }[],
): number {
  return lines.filter((l) => l.countedQty === null).length;
}
