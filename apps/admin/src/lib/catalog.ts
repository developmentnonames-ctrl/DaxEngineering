import type { AdminCatalog } from '@dax/platform-contract';

export type CatalogModule = AdminCatalog['modules'][number];
export type CatalogFeature = CatalogModule['features'][number];
export type CatalogAction = CatalogFeature['actions'][number];
export type CatalogEntity = AdminCatalog['entities'][number];
export type CatalogField = CatalogEntity['fields'][number];

export interface PermissionInfo {
  key: string;
  label: string;
  moduleName: string;
  featureName: string;
  action: CatalogAction;
}

export function permissionIndex(
  catalog: AdminCatalog,
): Map<string, PermissionInfo> {
  const out = new Map<string, PermissionInfo>();
  for (const m of catalog.modules) {
    for (const f of m.features) {
      for (const a of f.actions) {
        out.set(a.permissionKey, {
          key: a.permissionKey,
          label: `${m.name} · ${f.name} · ${a.label}`,
          moduleName: m.name,
          featureName: f.name,
          action: a,
        });
      }
    }
  }
  return out;
}

export function tierDefault(field: CatalogField): {
  read: boolean;
  write: boolean;
} {
  const read = field.locked || field.tier === 'INTERNAL';
  return { read, write: read && field.writable && field.tier === 'INTERNAL' };
}
