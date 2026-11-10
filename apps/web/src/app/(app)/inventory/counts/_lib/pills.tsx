import { Pill } from '@dax/web-shell';
import {
  COUNT_KIND_LABELS,
  COUNT_STATUS,
  type CountKind,
  type CountStatus,
} from './labels';

export function CountStatusPill({ status }: { status: CountStatus }) {
  const look = COUNT_STATUS[status];
  return <Pill tone={look.tone}>{look.label}</Pill>;
}

export function CountKindPill({ kind }: { kind: CountKind }) {
  return <Pill>{COUNT_KIND_LABELS[kind]} count</Pill>;
}

export function BlindPill({ blind }: { blind: boolean }) {
  return blind ? <Pill tone="yel">Blind</Pill> : null;
}
