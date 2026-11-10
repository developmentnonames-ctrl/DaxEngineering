import type {
  RETURN_CONDITIONS,
  RETURN_STATUSES,
} from '@dax/inventory-contract';
import type { PillTone } from '@dax/web-shell';

export type ReturnStatus = (typeof RETURN_STATUSES)[number];
export type ReturnCondition = (typeof RETURN_CONDITIONS)[number];

export const BASE = '/inventory/returns';
export const returnPath = (id: string) => `${BASE}/${id}`;
export const editReturnPath = (id: string) => `${BASE}/${id}/edit`;
export const newReturnFromAod = (aodId: string) => `${BASE}/new?aod=${aodId}`;
export const FREE_RETURN_PATH = `${BASE}/new?mode=free`;
export const aodPath = (id: string) => `/inventory/issuing/aods/${id}`;
export const warrantyPath = (id: string) => `/inventory/warranty/${id}`;

interface Look {
  label: string;
  tone?: PillTone;
}

export const RETURN_STATUS: Record<ReturnStatus, Look> = {
  DRAFT: { label: 'Draft', tone: 'hi' },
  POSTED: { label: 'Posted', tone: 'ok' },
  CANCELLED: { label: 'Cancelled', tone: 'bad' },
};

export const CONDITION: Record<ReturnCondition, Look> = {
  GOOD: { label: 'Good', tone: 'ok' },
  DAMAGED: { label: 'Damaged', tone: 'yel' },
  FAULTY: { label: 'Faulty', tone: 'bad' },
};

export const CONDITION_OPTIONS = (
  Object.keys(CONDITION) as ReturnCondition[]
).map((value) => ({ value, label: CONDITION[value].label }));

export const RETURN_FILTERS = [
  { value: 'ALL', label: 'All' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'POSTED', label: 'Posted' },
  { value: 'CANCELLED', label: 'Cancelled' },
];
