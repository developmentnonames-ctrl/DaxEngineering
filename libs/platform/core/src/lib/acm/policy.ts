import type { FieldTier, GrantScope } from '@dax/contracts';

export const SCOPE_RANK: Record<GrantScope, number> = {
  OWN: 1,
  DEPARTMENT: 2,
  ALL: 3,
};

export interface Grant {
  scope: GrantScope;
  storeIds: readonly string[];
}

export interface FieldAccess {
  read: ReadonlySet<string>;
  write: ReadonlySet<string>;
}

export interface Policy {
  userId: string;
  isSuperAdmin: boolean;
  require2fa: boolean;
  departmentIds: readonly string[];
  roleIds: readonly string[];
  enabledModules: ReadonlySet<string>;
  permissions: ReadonlyMap<string, Grant>;
  sources: ReadonlyMap<string, 'role' | 'override' | 'super_admin'>;
  denied: ReadonlySet<string>;
  fields: ReadonlyMap<string, FieldAccess>;
  validUntil: number;
  version: string;
}

export interface CatalogPermission {
  key: string;
  moduleKey: string;
  scopes: readonly GrantScope[];
}

export interface CatalogField {
  id: string;
  entityKey: string;
  moduleKey: string;
  name: string;
  tier: FieldTier;
  locked: boolean;
  writable: boolean;
}

export interface PolicyCatalog {
  permissions: ReadonlyMap<string, CatalogPermission>;
  fields: readonly CatalogField[];
}

export interface RoleInput {
  id: string;
  isSuperAdmin: boolean;
  require2fa: boolean;
  expiresAt: Date | null;
  permissions: readonly {
    key: string;
    scope: GrantScope;
    storeIds: readonly string[];
  }[];
  fieldGrants: readonly {
    fieldId: string;
    canRead: boolean;
    canWrite: boolean;
  }[];
}

export interface OverrideInput {
  permissionKey: string;
  effect: 'GRANT' | 'DENY';
  scope: GrantScope | null;
  expiresAt: Date | null;
}

export interface PolicyInput {
  userId: string;
  departmentIds: readonly string[];
  roles: readonly RoleInput[];
  overrides: readonly OverrideInput[];
  enabledModules: ReadonlySet<string>;
  catalog: PolicyCatalog;
  now: Date;
  version: string;
  maxAgeMs?: number;
}

const DEFAULT_MAX_AGE_MS = 15 * 60 * 1000;

function active(expiresAt: Date | null, now: Date): boolean {
  return expiresAt === null || expiresAt.getTime() > now.getTime();
}

function widestAllowed(
  wanted: GrantScope,
  allowed: readonly GrantScope[],
): GrantScope | null {
  const fits = allowed.filter((s) => SCOPE_RANK[s] <= SCOPE_RANK[wanted]);
  if (fits.length === 0) return null;
  return fits.reduce((a, b) => (SCOPE_RANK[a] >= SCOPE_RANK[b] ? a : b));
}

function mergeGrant(current: Grant | undefined, next: Grant): Grant {
  if (!current) return next;
  const scope =
    SCOPE_RANK[next.scope] > SCOPE_RANK[current.scope]
      ? next.scope
      : current.scope;
  const storeIds =
    current.storeIds.length === 0 || next.storeIds.length === 0
      ? []
      : [...new Set([...current.storeIds, ...next.storeIds])];
  return { scope, storeIds };
}

export function resolvePolicy(input: PolicyInput): Policy {
  const { now, catalog, enabledModules } = input;
  const roles = input.roles.filter((r) => active(r.expiresAt, now));
  const overrides = input.overrides.filter((o) => active(o.expiresAt, now));

  let validUntil = now.getTime() + (input.maxAgeMs ?? DEFAULT_MAX_AGE_MS);
  for (const e of [...input.roles, ...input.overrides]) {
    if (e.expiresAt && e.expiresAt.getTime() > now.getTime()) {
      validUntil = Math.min(validUntil, e.expiresAt.getTime());
    }
  }

  const isSuperAdmin = roles.some((r) => r.isSuperAdmin);
  const require2fa = roles.some((r) => r.require2fa || r.isSuperAdmin);
  const usable = (key: string): CatalogPermission | null => {
    const p = catalog.permissions.get(key);
    return p && enabledModules.has(p.moduleKey) ? p : null;
  };

  const permissions = new Map<string, Grant>();
  const sources = new Map<string, 'role' | 'override' | 'super_admin'>();
  const denied = new Set<string>();

  if (isSuperAdmin) {
    for (const p of catalog.permissions.values()) {
      if (!enabledModules.has(p.moduleKey)) continue;
      permissions.set(p.key, { scope: 'ALL', storeIds: [] });
      sources.set(p.key, 'super_admin');
    }
  } else {
    for (const role of roles) {
      for (const g of role.permissions) {
        const p = usable(g.key);
        const scope = p && widestAllowed(g.scope, p.scopes);
        if (!p || !scope) continue;
        permissions.set(
          g.key,
          mergeGrant(permissions.get(g.key), { scope, storeIds: g.storeIds }),
        );
        sources.set(g.key, 'role');
      }
    }
    for (const o of overrides) {
      const p = usable(o.permissionKey);
      if (!p || o.effect !== 'GRANT') continue;
      const scope = widestAllowed(o.scope ?? 'ALL', p.scopes);
      if (!scope) continue;
      permissions.set(
        o.permissionKey,
        mergeGrant(permissions.get(o.permissionKey), { scope, storeIds: [] }),
      );
      sources.set(o.permissionKey, 'override');
    }
    for (const o of overrides) {
      if (o.effect !== 'DENY') continue;
      permissions.delete(o.permissionKey);
      sources.delete(o.permissionKey);
      denied.add(o.permissionKey);
    }
  }

  const fields = new Map<string, { read: Set<string>; write: Set<string> }>();
  const grantsByRole = roles.map(
    (r) => new Map(r.fieldGrants.map((g) => [g.fieldId, g])),
  );
  for (const f of catalog.fields) {
    if (!enabledModules.has(f.moduleKey)) continue;
    let read = false;
    let write = false;
    if (isSuperAdmin) {
      read = true;
      write = f.writable;
    } else {
      for (const grants of grantsByRole) {
        const g = grants.get(f.id);
        const r = f.locked || (g ? g.canRead : f.tier === 'INTERNAL');
        const w = f.writable && r && (g ? g.canWrite : f.tier === 'INTERNAL');
        read ||= r;
        write ||= w;
      }
    }
    if (!read) continue;
    let access = fields.get(f.entityKey);
    if (!access) {
      access = { read: new Set(), write: new Set() };
      fields.set(f.entityKey, access);
    }
    access.read.add(f.name);
    if (write) access.write.add(f.name);
  }

  return {
    userId: input.userId,
    isSuperAdmin,
    require2fa,
    departmentIds: input.departmentIds,
    roleIds: roles.map((r) => r.id),
    enabledModules,
    permissions,
    sources,
    denied,
    fields,
    validUntil,
    version: input.version,
  };
}

export function can(policy: Policy, permission: string): boolean {
  return policy.permissions.has(permission);
}

export function grantOf(policy: Policy, permission: string): Grant | null {
  return policy.permissions.get(permission) ?? null;
}

export function readableFields(
  policy: Policy,
  entityKey: string,
): ReadonlySet<string> {
  return policy.fields.get(entityKey)?.read ?? new Set();
}

export function writableFields(
  policy: Policy,
  entityKey: string,
): ReadonlySet<string> {
  return policy.fields.get(entityKey)?.write ?? new Set();
}

export function covers(held: Grant | null, wanted: Grant): boolean {
  if (!held) return false;
  if (SCOPE_RANK[held.scope] < SCOPE_RANK[wanted.scope]) return false;
  if (held.storeIds.length === 0) return true;
  if (wanted.storeIds.length === 0) return false;
  return wanted.storeIds.every((s) => held.storeIds.includes(s));
}

export function canHandOut(
  actor: Policy,
  permission: string,
  scope: GrantScope,
): boolean {
  if (actor.isSuperAdmin) return true;
  return covers(grantOf(actor, permission), { scope, storeIds: [] });
}

export function canHandOutField(
  actor: Policy,
  entityKey: string,
  field: string,
  wants: { read: boolean; write: boolean },
): boolean {
  if (actor.isSuperAdmin) return true;
  if (wants.read && !readableFields(actor, entityKey).has(field)) return false;
  if (wants.write && !writableFields(actor, entityKey).has(field)) return false;
  return true;
}
