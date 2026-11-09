import { BIN_KINDS, UOMS } from '@dax/inventory-contract';

const number = new Intl.NumberFormat('en-LK', { maximumFractionDigits: 3 });

export function formatQty(value: string): string {
  const n = Number(value);
  return Number.isFinite(n) ? number.format(n) : value;
}

export function trimQty(value: string): string {
  return value.includes('.') ? value.replace(/\.?0+$/, '') : value;
}

const dateTime = new Intl.DateTimeFormat('en-LK', {
  timeZone: 'Asia/Colombo',
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : dateTime.format(d);
}

export type BinKind = (typeof BIN_KINDS)[number];

export const BIN_KIND_LABELS: Record<BinKind, string> = {
  STORAGE: 'Storage',
  RECEIVING: 'Receiving',
  QUARANTINE: 'Quarantine',
  WARRANTY: 'Warranty',
};

export const BIN_KIND_OPTIONS = BIN_KINDS.map((k) => ({
  value: k,
  label: BIN_KIND_LABELS[k],
}));

export const UOM_OPTIONS = UOMS.map((u) => ({
  value: u.code,
  label: `${u.label} (${u.code})`,
}));

export function uomLabel(code: string): string {
  return UOMS.find((u) => u.code === code)?.label ?? code;
}
