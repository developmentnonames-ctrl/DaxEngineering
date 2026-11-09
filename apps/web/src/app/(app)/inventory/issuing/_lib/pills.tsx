import { Pill } from '@dax/web-shell';
import {
  AOD_STATUS,
  type AodStatus,
  HOLD_STATUS,
  type HoldStatus,
  MRN_STATUS,
  type MrnStatus,
} from './labels';

export function MrnStatusPill({ status }: { status: MrnStatus }) {
  const look = MRN_STATUS[status];
  return <Pill tone={look.tone}>{look.label}</Pill>;
}

export function AodStatusPill({ status }: { status: AodStatus }) {
  const look = AOD_STATUS[status];
  return <Pill tone={look.tone}>{look.label}</Pill>;
}

export function HoldStatusPill({ status }: { status: HoldStatus }) {
  const look = HOLD_STATUS[status];
  return <Pill tone={look.tone}>{look.label}</Pill>;
}

export function WaitingPill({ count }: { count: number }) {
  return count > 0 ? (
    <Pill tone="hi">
      {count} {count === 1 ? 'line' : 'lines'} waiting
    </Pill>
  ) : null;
}
