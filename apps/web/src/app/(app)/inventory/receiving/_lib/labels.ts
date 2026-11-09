import type {
  DISCREPANCY_KINDS,
  GRN_STATUSES,
  GRN_SUBTYPES,
  MOVEMENT_TYPES,
} from '@dax/inventory-contract';
import type { PillTone } from '@dax/web-shell';

export type GrnStatus = (typeof GRN_STATUSES)[number];
export type GrnSubtype = (typeof GRN_SUBTYPES)[number];
export type DiscrepancyKind = (typeof DISCREPANCY_KINDS)[number];
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const BASE = '/inventory/receiving';
export const grnPath = (id: string) => `${BASE}/grns/${id}`;
export const discrepancyPath = (id: string) => `${BASE}/discrepancies/${id}`;

interface StatusLook {
  label: string;
  tone?: PillTone;
}

export const GRN_STATUS: Record<GrnStatus, StatusLook> = {
  DRAFT: { label: 'Draft' },
  CHECKED: { label: 'Checked', tone: 'int' },
  POSTED: { label: 'Posted', tone: 'hi' },
  PUT_AWAY: { label: 'Put away', tone: 'ok' },
  CANCELLED: { label: 'Cancelled', tone: 'bad' },
  REVERSED: { label: 'Reversed', tone: 'bad' },
};

export const DISCREPANCY_KIND: Record<DiscrepancyKind, StatusLook> = {
  SHORT: { label: 'Short', tone: 'bad' },
  EXCESS: { label: 'Extra', tone: 'yel' },
  DAMAGED: { label: 'Damaged', tone: 'bad' },
  WRONG_ITEM: { label: 'Wrong item', tone: 'ext' },
};

export const DISCREPANCY_STATUS: Record<'OPEN' | 'CLOSED', StatusLook> = {
  OPEN: { label: 'Open', tone: 'hi' },
  CLOSED: { label: 'Closed', tone: 'ok' },
};

export const SUBTYPE_LABELS: Record<GrnSubtype, string> = {
  FOR: 'Foreign (FOR)',
  LOC: 'Local (LOC)',
};

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  RECEIVE: 'Received',
  RECEIVE_DAMAGED: 'Received damaged',
  PUTAWAY_OUT: 'Put away from',
  PUTAWAY_IN: 'Put away to',
  REVERSAL: 'Reversed',
};

export const EDITABLE_GRN: readonly GrnStatus[] = ['DRAFT', 'CHECKED'];

export function documentPath(docType: string, docId: string): string | null {
  return docType === 'GRN' ? grnPath(docId) : null;
}
