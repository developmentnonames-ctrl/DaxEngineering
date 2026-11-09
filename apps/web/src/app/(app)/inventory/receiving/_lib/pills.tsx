import { Pill } from '@dax/web-shell';
import {
  DISCREPANCY_KIND,
  DISCREPANCY_STATUS,
  type DiscrepancyKind,
  GRN_STATUS,
  type GrnStatus,
} from './labels';

export function GrnStatusPill({ status }: { status: GrnStatus }) {
  const look = GRN_STATUS[status];
  return <Pill tone={look.tone}>{look.label}</Pill>;
}

export function KindPill({ kind }: { kind: DiscrepancyKind }) {
  const look = DISCREPANCY_KIND[kind];
  return <Pill tone={look.tone}>{look.label}</Pill>;
}

export function DiscrepancyStatusPill({
  status,
}: {
  status: 'OPEN' | 'CLOSED';
}) {
  const look = DISCREPANCY_STATUS[status];
  return <Pill tone={look.tone}>{look.label}</Pill>;
}
