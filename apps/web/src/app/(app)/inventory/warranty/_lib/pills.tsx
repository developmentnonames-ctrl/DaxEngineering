import type { WarrantyOutcome, WarrantyStatus } from '@dax/inventory-contract';
import { Pill } from '@dax/web-shell';
import { OUTCOME, WARRANTY_STATUS } from './labels';

export function WarrantyStatusPill({ status }: { status: WarrantyStatus }) {
  const look = WARRANTY_STATUS[status];
  return <Pill tone={look.tone}>{look.label}</Pill>;
}

export function OutcomePill({ outcome }: { outcome: WarrantyOutcome | null }) {
  if (!outcome) return null;
  const look = OUTCOME[outcome];
  return <Pill tone={look.tone}>{look.label}</Pill>;
}
