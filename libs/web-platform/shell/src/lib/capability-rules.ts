import type { Capabilities } from '@dax/platform-contract';

type Scope = Capabilities['permissions'][string];
const SCOPE_ORDER: Record<Scope, number> = { OWN: 1, DEPARTMENT: 2, ALL: 3 };

export function canDo(
  caps: Capabilities,
  permission: string,
  atLeast?: Scope,
): boolean {
  if (caps.isSuperAdmin) return true;
  const scope = caps.permissions[permission];
  if (!scope) return false;
  return !atLeast || SCOPE_ORDER[scope] >= SCOPE_ORDER[atLeast];
}

export function canReadField(
  caps: Capabilities,
  entity: string,
  field: string,
): boolean {
  if (caps.isSuperAdmin) return true;
  return caps.fields[entity]?.read.includes(field) ?? false;
}

export function canWriteField(
  caps: Capabilities,
  entity: string,
  field: string,
): boolean {
  if (caps.isSuperAdmin) return true;
  return caps.fields[entity]?.write.includes(field) ?? false;
}
