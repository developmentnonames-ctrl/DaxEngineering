import type { RoleDetail } from '@dax/platform-contract';
import {
  type CatalogAction,
  type CatalogEntity,
  type CatalogField,
  tierDefault,
} from '../../../lib/catalog';

export type GrantScope = RoleDetail['permissions'][number]['scope'];
export type RoleGrant = RoleDetail['permissions'][number];
export type RoleFieldGrant = RoleDetail['fieldGrants'][number];
export type PermissionState = Record<string, GrantScope>;
export interface FieldAccess {
  read: boolean;
  write: boolean;
}
export type FieldState = Record<string, FieldAccess>;

const SCOPE_ORDER: readonly GrantScope[] = ['OWN', 'DEPARTMENT', 'ALL'];

// Actions declared without scopes are granted at ALL.
export function allowedScopes(action: CatalogAction): GrantScope[] {
  const allowed = SCOPE_ORDER.filter((s) => action.scopes.includes(s));
  return allowed.length ? allowed : ['ALL'];
}

export function widestScope(action: CatalogAction): GrantScope {
  return allowedScopes(action).at(-1) ?? 'ALL';
}

export function humanize(key: string): string {
  const text = key.replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function permissionState(grants: readonly RoleGrant[]): PermissionState {
  return Object.fromEntries(grants.map((g) => [g.permissionKey, g.scope]));
}

export function permissionList(state: PermissionState): RoleGrant[] {
  return Object.entries(state)
    .map(([permissionKey, scope]) => ({ permissionKey, scope }))
    .sort((a, b) => a.permissionKey.localeCompare(b.permissionKey));
}

export function normalizeAccess(
  field: CatalogField,
  access: FieldAccess,
): FieldAccess {
  const read = field.locked || access.read;
  return { read, write: read && field.writable && access.write };
}

export function fieldState(
  entities: readonly CatalogEntity[],
  grants: readonly RoleFieldGrant[],
): FieldState {
  const byField = new Map(grants.map((g) => [g.fieldId, g]));
  const out: FieldState = {};
  for (const entity of entities) {
    for (const field of entity.fields) {
      const grant = byField.get(field.id);
      out[field.id] = grant
        ? normalizeAccess(field, { read: grant.canRead, write: grant.canWrite })
        : tierDefault(field);
    }
  }
  return out;
}

export function isChanged(field: CatalogField, access: FieldAccess): boolean {
  const def = tierDefault(field);
  const value = normalizeAccess(field, access);
  return value.read !== def.read || value.write !== def.write;
}

export function fieldDeviations(
  entities: readonly CatalogEntity[],
  state: FieldState,
): RoleFieldGrant[] {
  const out: RoleFieldGrant[] = [];
  for (const entity of entities) {
    for (const field of entity.fields) {
      const access = state[field.id];
      if (!access || !isChanged(field, access)) continue;
      const value = normalizeAccess(field, access);
      out.push({
        fieldId: field.id,
        canRead: value.read,
        canWrite: value.write,
      });
    }
  }
  return out.sort((a, b) => a.fieldId.localeCompare(b.fieldId));
}

export function grantsSnapshot(
  permissions: readonly RoleGrant[],
  fieldGrants: readonly RoleFieldGrant[],
): string {
  return JSON.stringify([permissions, fieldGrants]);
}
