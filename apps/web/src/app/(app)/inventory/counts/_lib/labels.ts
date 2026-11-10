import type { COUNT_KINDS, COUNT_STATUSES } from '@dax/inventory-contract';
import type { PillTone } from '@dax/web-shell';

export type CountKind = (typeof COUNT_KINDS)[number];
export type CountStatus = (typeof COUNT_STATUSES)[number];

export const BASE = '/inventory/counts';
export const countPath = (id: string) => `${BASE}/${id}`;

interface Look {
  label: string;
  tone?: PillTone;
}

export const COUNT_STATUS: Record<CountStatus, Look> = {
  COUNTING: { label: 'Counting', tone: 'hi' },
  SUBMITTED: { label: 'To approve', tone: 'int' },
  POSTED: { label: 'Posted', tone: 'ok' },
  CANCELLED: { label: 'Cancelled', tone: 'bad' },
};

export const COUNT_KIND_LABELS: Record<CountKind, string> = {
  CYCLE: 'Cycle',
  FULL: 'Full',
  OPENING: 'Opening',
};

export const COUNT_KIND_OPTIONS = (
  Object.keys(COUNT_KIND_LABELS) as CountKind[]
).map((value) => ({ value, label: COUNT_KIND_LABELS[value] }));

export const COUNT_FILTERS = [
  { value: 'OPEN', label: 'Open' },
  { value: 'COUNTING', label: 'Counting' },
  { value: 'SUBMITTED', label: 'To approve' },
  { value: 'POSTED', label: 'Posted' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'ALL', label: 'All' },
];
