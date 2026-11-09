import type {
  AOD_STATUSES,
  AOD_TYPES,
  HOLD_STATUSES,
  MRN_STATUSES,
  MRN_SUBTYPES,
} from '@dax/inventory-contract';
import type { PillTone } from '@dax/web-shell';

export type MrnStatus = (typeof MRN_STATUSES)[number];
export type MrnSubtype = (typeof MRN_SUBTYPES)[number];
export type AodStatus = (typeof AOD_STATUSES)[number];
export type AodType = (typeof AOD_TYPES)[number];
export type HoldStatus = (typeof HOLD_STATUSES)[number];

export const BASE = '/inventory/issuing';
export const mrnPath = (id: string) => `${BASE}/mrns/${id}`;
export const aodPath = (id: string) => `${BASE}/aods/${id}`;
export const holdPath = (id: string) => `${BASE}/holds/${id}`;
export const aodPdfPath = (id: string) => `/api/aods/${id}/pdf`;
export const AOD_ENTITY = 'inventory.aod';

interface Look {
  label: string;
  tone?: PillTone;
}

export const MRN_STATUS: Record<MrnStatus, Look> = {
  DRAFT: { label: 'Draft' },
  SUBMITTED: { label: 'To check', tone: 'hi' },
  CHECKED: { label: 'Checked', tone: 'int' },
  READY: { label: 'Ready to pick', tone: 'ok' },
  PARTLY_ISSUED: { label: 'Partly issued', tone: 'int' },
  ISSUED: { label: 'Issued', tone: 'ok' },
  CLOSED: { label: 'Closed' },
  SHORT_CLOSED: { label: 'Short-closed', tone: 'yel' },
  CANCELLED: { label: 'Cancelled', tone: 'bad' },
};

export const AOD_STATUS: Record<AodStatus, Look> = {
  PICKING: { label: 'Picking', tone: 'hi' },
  ISSUED: { label: 'Awaiting signature', tone: 'bad' },
  SIGNED: { label: 'Signed', tone: 'ok' },
  CANCELLED: { label: 'Cancelled', tone: 'bad' },
};

export const HOLD_STATUS: Record<HoldStatus, Look> = {
  ACTIVE: { label: 'Active', tone: 'hi' },
  CONVERTED: { label: 'Converted', tone: 'ok' },
  RELEASED: { label: 'Released' },
};

export const MRN_SUBTYPE_LABELS: Record<MrnSubtype, string> = {
  PRT: 'Parts',
  SRV: 'Service',
  SAL: 'Sales',
};

export const AOD_TYPE_LABELS: Record<AodType, string> = {
  SER: 'Service',
  REP: 'Repair',
  INS: 'Inspection',
  BRK: 'Breakdown',
  DIR: 'Direct sale',
  HIR: 'Hiring',
};

export const DEFAULT_AOD_TYPE: Record<MrnSubtype, AodType> = {
  PRT: 'SER',
  SRV: 'SER',
  SAL: 'DIR',
};

export const MRN_SUBTYPE_OPTIONS = (
  Object.keys(MRN_SUBTYPE_LABELS) as MrnSubtype[]
).map((value) => ({ value, label: MRN_SUBTYPE_LABELS[value] }));

export const AOD_TYPE_OPTIONS = (Object.keys(AOD_TYPE_LABELS) as AodType[]).map(
  (value) => ({ value, label: AOD_TYPE_LABELS[value] }),
);

export const PICKABLE_MRN: readonly MrnStatus[] = [
  'CHECKED',
  'READY',
  'PARTLY_ISSUED',
];

export const MRN_FILTERS = [
  { value: 'OPEN', label: 'Open' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SUBMITTED', label: 'To check' },
  { value: 'WAITING', label: 'Waiting for stock' },
  { value: 'READY', label: 'Ready to pick' },
  { value: 'PARTLY_ISSUED', label: 'Partly issued' },
  { value: 'ISSUED', label: 'Issued' },
  { value: 'ALL', label: 'All' },
];
