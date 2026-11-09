import { createHash } from 'node:crypto';
import { type GrantScope, type ModuleManifest } from '@dax/contracts';
import {
  CORE_MODULE_KEY,
  SEEDED_DEPARTMENTS,
  SEEDED_ROLES,
} from '@dax/platform-contract';
import type { TransactionClient } from '@dax/platform-db';
import { columnOf, type EntityDef } from './entity';
import { SCOPE_RANK } from './policy';

export interface Catalog {
  modules: readonly ModuleManifest[];
  entities: readonly EntityDef[];
}

export interface SyncResult {
  changed: boolean;
  newPermissions: string[];
  removedPermissions: string[];
}

function titleCase(key: string): string {
  const words = key.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function catalogHash(catalog: Catalog): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        modules: catalog.modules,
        entities: catalog.entities,
        roles: SEEDED_ROLES,
        departments: SEEDED_DEPARTMENTS,
      }),
    )
    .digest('hex');
}

export interface PermissionRow {
  key: string;
  moduleKey: string;
  featureKey: string;
  action: string;
  label: string;
  description: string | null;
  scopes: GrantScope[];
  isApproval: boolean;
}

export function permissionRows(m: ModuleManifest): PermissionRow[] {
  const rows: PermissionRow[] = [];
  for (const [featureKey, feature] of Object.entries(m.features)) {
    for (const [action, def] of Object.entries(feature.actions)) {
      rows.push({
        key: `${m.key}.${featureKey}.${action}`,
        moduleKey: m.key,
        featureKey,
        action,
        label: def.label ?? titleCase(action),
        description: def.description ?? null,
        scopes: [...(def.scopes ?? ['ALL'])],
        isApproval: def.approval ?? false,
      });
    }
  }
  return rows;
}

export function defaultGrantsFor(
  m: ModuleManifest,
  newKeys: ReadonlySet<string>,
): { roleKey: string; permissionKey: string; scope: GrantScope }[] {
  const rows = permissionRows(m);
  const out: { roleKey: string; permissionKey: string; scope: GrantScope }[] =
    [];
  for (const [roleKey, grants] of Object.entries(m.defaultGrants ?? {})) {
    for (const [target, wanted] of Object.entries(grants)) {
      const targets =
        target === '*'
          ? rows
          : rows.filter((r) => r.key === `${m.key}.${target}`);
      for (const row of targets) {
        if (!newKeys.has(row.key)) continue;
        const fits = row.scopes.filter(
          (s) => SCOPE_RANK[s] <= SCOPE_RANK[wanted],
        );
        if (fits.length === 0) continue;
        const scope = fits.reduce((a, b) =>
          SCOPE_RANK[a] >= SCOPE_RANK[b] ? a : b,
        );
        out.push({ roleKey, permissionKey: row.key, scope });
      }
    }
  }
  return out;
}

export async function syncRegistry(
  tx: TransactionClient,
  catalog: Catalog,
  now = new Date(),
): Promise<SyncResult> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('dax.registry'))`;
  const hash = catalogHash(catalog);
  const state = await tx.registryState.findUnique({ where: { id: 1 } });
  if (state?.catalogHash === hash) {
    return { changed: false, newPermissions: [], removedPermissions: [] };
  }

  const firstSync = (await tx.module.count()) === 0;
  const moduleKeys = catalog.modules.map((m) => m.key);

  for (const m of catalog.modules) {
    const core = m.key === CORE_MODULE_KEY;
    await tx.module.upsert({
      where: { key: m.key },
      create: {
        key: m.key,
        name: m.name,
        description: m.description ?? null,
        dependsOn: [...m.dependsOn],
        enabled: core || firstSync,
        toggleable: !core,
      },
      update: {
        name: m.name,
        description: m.description ?? null,
        dependsOn: [...m.dependsOn],
        toggleable: !core,
        ...(core ? { enabled: true } : {}),
        removedAt: null,
      },
    });
    for (const [key, feature] of Object.entries(m.features)) {
      await tx.feature.upsert({
        where: { moduleKey_key: { moduleKey: m.key, key } },
        create: {
          moduleKey: m.key,
          key,
          name: feature.name,
          description: feature.description ?? null,
        },
        update: {
          name: feature.name,
          description: feature.description ?? null,
          removedAt: null,
        },
      });
    }
    await tx.feature.updateMany({
      where: {
        moduleKey: m.key,
        key: { notIn: Object.keys(m.features) },
        removedAt: null,
      },
      data: { removedAt: now },
    });
  }
  await tx.module.updateMany({
    where: { key: { notIn: moduleKeys }, removedAt: null },
    data: { removedAt: now, enabled: false },
  });

  const existing = new Set(
    (
      await tx.permission.findMany({
        where: { removedAt: null },
        select: { key: true },
      })
    ).map((p) => p.key),
  );
  const allRows = catalog.modules.flatMap(permissionRows);
  const allKeys = new Set(allRows.map((r) => r.key));
  for (const row of allRows) {
    await tx.permission.upsert({
      where: { key: row.key },
      create: row,
      update: { ...row, removedAt: null },
    });
  }
  const removedPermissions = [...existing].filter((k) => !allKeys.has(k));
  await tx.permission.updateMany({
    where: { key: { in: removedPermissions } },
    data: { removedAt: now },
  });
  const newPermissions = [...allKeys].filter((k) => !existing.has(k));

  for (const def of catalog.entities) {
    await tx.entity.upsert({
      where: { key: def.key },
      create: {
        key: def.key,
        moduleKey: def.moduleKey,
        label: def.label,
        tableName: def.table,
      },
      update: {
        moduleKey: def.moduleKey,
        label: def.label,
        tableName: def.table,
      },
    });
    for (const [name, meta] of Object.entries(def.fields)) {
      const data = {
        column: columnOf(def, name),
        label: meta.label,
        tier: meta.tier,
        encrypted: meta.encrypted ?? false,
        locked: meta.locked ?? false,
        writable: meta.writable ?? false,
        group: meta.group ?? null,
        filterable: meta.filterable ?? false,
        sortable: meta.sortable ?? false,
      };
      await tx.field.upsert({
        where: { entityKey_name: { entityKey: def.key, name } },
        create: { entityKey: def.key, name, ...data },
        update: { ...data, removedAt: null },
      });
    }
    await tx.field.updateMany({
      where: {
        entityKey: def.key,
        name: { notIn: Object.keys(def.fields) },
        removedAt: null,
      },
      data: { removedAt: now },
    });
  }

  const seriesKeys: { docType: string; subtype: string }[] = [];
  for (const m of catalog.modules) {
    for (const s of m.numberSeries ?? []) {
      const subtypes = Object.entries(s.subtypes ?? {});
      const rows = subtypes.length
        ? subtypes.map(([sub, label]) => ({
            subtype: sub,
            name: `${s.name}: ${label}`,
          }))
        : [{ subtype: '', name: s.name }];
      for (const r of rows) {
        seriesKeys.push({ docType: s.docType, subtype: r.subtype });
        await tx.numberSeries.upsert({
          where: {
            docType_subtype: { docType: s.docType, subtype: r.subtype },
          },
          create: {
            moduleKey: m.key,
            docType: s.docType,
            subtype: r.subtype,
            name: r.name,
            pattern: r.subtype ? '{DOC}/{SUB}/{FY}/{SEQ}' : '{DOC}/{FY}/{SEQ}',
          },
          update: { moduleKey: m.key, name: r.name, removedAt: null },
        });
      }
    }
  }
  const liveSeries = await tx.numberSeries.findMany({
    where: { removedAt: null },
    select: { id: true, docType: true, subtype: true },
  });
  const gone = liveSeries.filter(
    (s) =>
      !seriesKeys.some(
        (k) => k.docType === s.docType && k.subtype === s.subtype,
      ),
  );
  if (gone.length) {
    await tx.numberSeries.updateMany({
      where: { id: { in: gone.map((s) => s.id) } },
      data: { removedAt: now, active: false },
    });
  }

  for (const [key, role] of Object.entries(SEEDED_ROLES)) {
    await tx.role.upsert({
      where: { key },
      create: {
        key,
        name: role.name,
        description: role.description,
        isSystem: true,
        isSuperAdmin: key === 'super_admin',
        require2fa: key === 'super_admin',
      },
      update: {},
    });
  }
  const roles = new Map(
    (
      await tx.role.findMany({
        where: { key: { not: null } },
        select: { id: true, key: true },
      })
    ).map((r) => [r.key as string, r.id]),
  );
  const fresh = new Set(newPermissions);
  const grants = catalog.modules
    .flatMap((m) => defaultGrantsFor(m, fresh))
    .filter((g) => roles.has(g.roleKey))
    .map((g) => ({
      roleId: roles.get(g.roleKey) as string,
      permissionKey: g.permissionKey,
      scope: g.scope,
      storeIds: [],
    }));
  if (grants.length) {
    await tx.rolePermission.createMany({ data: grants, skipDuplicates: true });
  }

  if ((await tx.department.count()) === 0) {
    await tx.department.createMany({ data: [...SEEDED_DEPARTMENTS] });
  }

  const superAdminRole = roles.get('super_admin');
  if (superAdminRole) {
    const flagged = await tx.user.findMany({
      where: {
        isSuperAdmin: true,
        roles: { none: { roleId: superAdminRole } },
      },
      select: { id: true },
    });
    if (flagged.length) {
      await tx.userRole.createMany({
        data: flagged.map((u) => ({ userId: u.id, roleId: superAdminRole })),
        skipDuplicates: true,
      });
    }
  }

  await tx.registryState.upsert({
    where: { id: 1 },
    create: { id: 1, catalogHash: hash, syncedAt: now },
    update: { catalogHash: hash, syncedAt: now },
  });
  return { changed: true, newPermissions, removedPermissions };
}
