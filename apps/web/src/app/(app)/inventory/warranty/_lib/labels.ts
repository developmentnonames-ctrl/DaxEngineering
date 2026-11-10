import {
  WARRANTY_NOTE_REQUIRED,
  WARRANTY_OUTCOMES,
  type WarrantyOutcome,
  type WarrantyStatus,
} from '@dax/inventory-contract';
import type { PillTone } from '@dax/web-shell';

export const BASE = '/inventory/warranty';
export const WARRANTY_ENTITY = 'inventory.warranty_tag';
export const tagPath = (id: string) => `${BASE}/${id}`;
export const returnPath = (id: string) => `/inventory/returns/${id}`;

export const CUSTODY_NOTE =
  'Tagged parts sit in the warranty bin for safekeeping. They are not counted as stock and cannot be issued.';

interface Look {
  label: string;
  tone?: PillTone;
}

export const WARRANTY_STATUS: Record<WarrantyStatus, Look> = {
  TAGGED: { label: 'In the bin', tone: 'hi' },
  SENT: { label: 'With supplier', tone: 'int' },
  CLOSED: { label: 'Closed' },
};

export const OUTCOME: Record<WarrantyOutcome, Look> = {
  REPLACED: { label: 'Replaced', tone: 'ok' },
  CREDITED: { label: 'Credited', tone: 'ok' },
  REJECTED: { label: 'Rejected', tone: 'bad' },
  RETURNED_TO_CUSTOMER: { label: 'Returned to customer' },
  SCRAPPED: { label: 'Scrapped', tone: 'yel' },
};

export const OUTCOME_OPTIONS = WARRANTY_OUTCOMES.map((value) => ({
  value,
  label: OUTCOME[value].label,
}));

export const needsNote = (outcome: WarrantyOutcome | null) =>
  outcome !== null && WARRANTY_NOTE_REQUIRED.includes(outcome);
