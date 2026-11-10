import { Pill } from '@dax/web-shell';
import {
  CONDITION,
  RETURN_STATUS,
  type ReturnCondition,
  type ReturnStatus,
} from './labels';

export function ReturnStatusPill({ status }: { status: ReturnStatus }) {
  const look = RETURN_STATUS[status];
  return <Pill tone={look.tone}>{look.label}</Pill>;
}

export function ConditionPill({ condition }: { condition: ReturnCondition }) {
  const look = CONDITION[condition];
  return <Pill tone={look.tone}>{look.label}</Pill>;
}
