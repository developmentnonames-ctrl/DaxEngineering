import { ForbiddenException } from '@nestjs/common';
import { coreManifest } from '@dax/platform-contract';
import { describe, expect, it } from 'vitest';
import {
  assertCanHandOutRole,
  type FieldInfo,
  normalizeFieldGrants,
} from '../admin/common';
import {
  decodeCursor,
  encodeCursor,
  visibleValues,
} from '../admin/audit.controller';
import {
  changedFields,
  REDACTED,
  sanitizeForAudit,
} from '../audit/audit.service';
import { defineEntity, EntityError } from './entity';
import {
  can,
  canHandOut,
  type CatalogField,
  type Policy,
  type PolicyInput,
  type RoleInput,
  resolvePolicy,
} from './policy';
import { catalogHash, defaultGrantsFor, permissionRows } from './registry';
import { assertWritable, buildSelect, project, scopeWhere } from './visibility';

const NOW = new Date('2026-11-10T08:00:00Z');

const entity = defineEntity<'id' | 'name' | 'phone' | 'cost' | 'createdBy'>({
  key: 'inventory.thing',
  moduleKey: 'inventory',
  label: 'Thing',
  table: 'inventory.thing',
  fields: {
    id: { label: 'ID', tier: 'INTERNAL', locked: true },
    name: { label: 'Name', tier: 'INTERNAL', writable: true },
    phone: { label: 'Phone', tier: 'CONFIDENTIAL', writable: true },
    cost: {
      label: 'Cost',
      tier: 'RESTRICTED',
      encrypted: true,
      writable: true,
    },
    createdBy: { label: 'Created by', tier: 'INTERNAL' },
  },
});

const fields: CatalogField[] = Object.entries(entity.fields).map(
  ([name, f]) => ({
    id: `f-${name}`,
    entityKey: entity.key,
    moduleKey: 'inventory',
    name,
    tier: f.tier,
    locked: f.locked ?? false,
    writable: f.writable ?? false,
  }),
);

const permissions = new Map(
  [
    ['inventory.thing.view', ['OWN', 'DEPARTMENT', 'ALL']],
    ['inventory.thing.edit', ['ALL']],
    ['parties.customer.view', ['ALL']],
  ].map(([key, scopes]) => [
    key as string,
    {
      key: key as string,
      moduleKey: (key as string).split('.')[0],
      scopes: scopes as ('OWN' | 'DEPARTMENT' | 'ALL')[],
    },
  ]),
);

function role(partial: Partial<RoleInput>): RoleInput {
  return {
    id: partial.id ?? 'r1',
    isSuperAdmin: false,
    require2fa: false,
    expiresAt: null,
    permissions: [],
    fieldGrants: [],
    ...partial,
  };
}

function policyFor(input: Partial<PolicyInput>): Policy {
  return resolvePolicy({
    userId: 'u1',
    departmentIds: ['d1'],
    roles: [],
    overrides: [],
    enabledModules: new Set(['inventory', 'parties']),
    catalog: { permissions, fields },
    now: NOW,
    version: '1.1',
    ...input,
  });
}

describe('resolvePolicy', () => {
  it('takes the widest scope across roles', () => {
    const p = policyFor({
      roles: [
        role({
          id: 'a',
          permissions: [
            { key: 'inventory.thing.view', scope: 'OWN', storeIds: [] },
          ],
        }),
        role({
          id: 'b',
          permissions: [
            { key: 'inventory.thing.view', scope: 'DEPARTMENT', storeIds: [] },
          ],
        }),
      ],
    });
    expect(p.permissions.get('inventory.thing.view')?.scope).toBe('DEPARTMENT');
  });

  it('lets a deny override win over roles and grants', () => {
    const p = policyFor({
      roles: [
        role({
          permissions: [
            { key: 'inventory.thing.view', scope: 'ALL', storeIds: [] },
          ],
        }),
      ],
      overrides: [
        {
          permissionKey: 'inventory.thing.view',
          effect: 'GRANT',
          scope: 'ALL',
          expiresAt: null,
        },
        {
          permissionKey: 'inventory.thing.view',
          effect: 'DENY',
          scope: null,
          expiresAt: null,
        },
      ],
    });
    expect(can(p, 'inventory.thing.view')).toBe(false);
    expect(p.denied.has('inventory.thing.view')).toBe(true);
  });

  it('ignores expired roles and limits the cache lifetime to the next expiry', () => {
    const soon = new Date(NOW.getTime() + 60_000);
    const p = policyFor({
      roles: [
        role({
          id: 'old',
          expiresAt: new Date(NOW.getTime() - 1),
          permissions: [
            { key: 'inventory.thing.edit', scope: 'ALL', storeIds: [] },
          ],
        }),
        role({
          id: 'temp',
          expiresAt: soon,
          permissions: [
            { key: 'inventory.thing.view', scope: 'ALL', storeIds: [] },
          ],
        }),
      ],
    });
    expect(can(p, 'inventory.thing.edit')).toBe(false);
    expect(can(p, 'inventory.thing.view')).toBe(true);
    expect(p.validUntil).toBe(soon.getTime());
  });

  it('drops permissions and fields of disabled modules', () => {
    const p = policyFor({
      enabledModules: new Set(['parties']),
      roles: [role({ isSuperAdmin: true })],
    });
    expect(can(p, 'inventory.thing.view')).toBe(false);
    expect(can(p, 'parties.customer.view')).toBe(true);
    expect(p.fields.has(entity.key)).toBe(false);
  });

  it('clamps a scope to what the action allows', () => {
    const p = policyFor({
      roles: [
        role({
          permissions: [
            { key: 'inventory.thing.edit', scope: 'DEPARTMENT', storeIds: [] },
          ],
        }),
      ],
    });
    expect(can(p, 'inventory.thing.edit')).toBe(false);
  });

  it('shows Internal fields by default and hides Confidential and Restricted', () => {
    const p = policyFor({ roles: [role({})] });
    const access = p.fields.get(entity.key);
    expect([...(access?.read ?? [])].sort()).toEqual([
      'createdBy',
      'id',
      'name',
    ]);
    expect([...(access?.write ?? [])]).toEqual(['name']);
  });

  it('unions field access across roles', () => {
    const p = policyFor({
      roles: [
        role({
          id: 'a',
          fieldGrants: [{ fieldId: 'f-name', canRead: false, canWrite: false }],
        }),
        role({
          id: 'b',
          fieldGrants: [{ fieldId: 'f-phone', canRead: true, canWrite: false }],
        }),
      ],
    });
    const read = p.fields.get(entity.key)?.read;
    expect(read?.has('name')).toBe(true);
    expect(read?.has('phone')).toBe(true);
    expect(p.fields.get(entity.key)?.write.has('phone')).toBe(false);
  });

  it('gives super admins everything and requires 2FA', () => {
    const p = policyFor({ roles: [role({ isSuperAdmin: true })] });
    expect(p.isSuperAdmin).toBe(true);
    expect(p.require2fa).toBe(true);
    expect(p.fields.get(entity.key)?.read.has('cost')).toBe(true);
  });
});

describe('visibility', () => {
  const viewer = policyFor({ roles: [role({})] });

  it('never selects hidden columns', () => {
    expect(buildSelect(entity, viewer)).toEqual({
      id: true,
      name: true,
      createdBy: true,
    });
  });

  it('projects only readable keys and decrypts readable encrypted fields', () => {
    const row = {
      id: 'x',
      name: 'N',
      phone: '077',
      cost: 'v1:k1:iv:ct',
      createdBy: 'u1',
    };
    expect(project(entity, viewer, row).data).toEqual({
      id: 'x',
      name: 'N',
      createdBy: 'u1',
    });
    const admin = policyFor({ roles: [role({ isSuperAdmin: true })] });
    const out = project(
      entity,
      admin,
      row,
      (_e, _f, id, v) => `${id}:${v.length}`,
    );
    expect(out.data.cost).toBe('x:11');
    expect(out.restrictedFields).toEqual(['cost']);
  });

  it('rejects writes to fields the user cannot change', () => {
    expect(() => assertWritable(entity, viewer, { name: 'ok' })).not.toThrow();
    expect(() => assertWritable(entity, viewer, { phone: '1' })).toThrow(
      ForbiddenException,
    );
  });

  it('builds scope filters from the grant', () => {
    const own = policyFor({
      roles: [
        role({
          permissions: [
            { key: 'inventory.thing.view', scope: 'OWN', storeIds: [] },
          ],
        }),
      ],
    });
    expect(
      scopeWhere(own, 'inventory.thing.view', { own: 'createdBy' }),
    ).toEqual({ createdBy: 'u1' });
    const dept = policyFor({
      roles: [
        role({
          permissions: [
            { key: 'inventory.thing.view', scope: 'DEPARTMENT', storeIds: [] },
          ],
        }),
      ],
    });
    expect(
      scopeWhere(dept, 'inventory.thing.view', { department: 'departmentId' }),
    ).toEqual({
      departmentId: { in: ['d1'] },
    });
    expect(() => scopeWhere(dept, 'inventory.thing.edit', {})).toThrow(
      ForbiddenException,
    );
  });
});

describe('entity definitions', () => {
  it('rejects encrypted non-Restricted fields', () => {
    expect(() =>
      defineEntity({
        key: 'inventory.bad',
        moduleKey: 'inventory',
        label: 'Bad',
        table: 'inventory.bad',
        fields: { x: { label: 'X', tier: 'CONFIDENTIAL', encrypted: true } },
      }),
    ).toThrow(EntityError);
  });
});

describe('escalation rules', () => {
  const info = new Map<string, FieldInfo>(
    fields.map((f) => [
      f.id,
      {
        id: f.id,
        entityKey: f.entityKey,
        name: f.name,
        tier: f.tier,
        locked: f.locked,
        writable: f.writable,
      },
    ]),
  );
  const delegate = policyFor({
    roles: [
      role({
        permissions: [
          { key: 'inventory.thing.view', scope: 'DEPARTMENT', storeIds: [] },
        ],
      }),
    ],
  });

  it('only hands out permissions at or below the actor’s scope', () => {
    expect(canHandOut(delegate, 'inventory.thing.view', 'OWN')).toBe(true);
    expect(canHandOut(delegate, 'inventory.thing.view', 'ALL')).toBe(false);
    expect(canHandOut(delegate, 'inventory.thing.edit', 'ALL')).toBe(false);
  });

  it('refuses roles with more than the actor holds', () => {
    expect(() =>
      assertCanHandOutRole(
        delegate,
        {
          isSuperAdmin: false,
          permissions: [
            { permissionKey: 'inventory.thing.view', scope: 'ALL' },
          ],
          fieldGrants: [],
        },
        info,
      ),
    ).toThrow(ForbiddenException);
    expect(() =>
      assertCanHandOutRole(
        delegate,
        {
          isSuperAdmin: false,
          permissions: [],
          fieldGrants: [{ fieldId: 'f-phone', canRead: true, canWrite: false }],
        },
        info,
      ),
    ).toThrow(ForbiddenException);
    expect(() =>
      assertCanHandOutRole(
        delegate,
        { isSuperAdmin: true, permissions: [], fieldGrants: [] },
        info,
      ),
    ).toThrow(ForbiddenException);
  });

  it('stores only deviations from the tier default', () => {
    expect(
      normalizeFieldGrants(
        [
          { fieldId: 'f-name', canRead: true, canWrite: true },
          { fieldId: 'f-phone', canRead: true, canWrite: true },
          { fieldId: 'f-createdBy', canRead: true, canWrite: true },
        ],
        info,
      ),
    ).toEqual([{ fieldId: 'f-phone', canRead: true, canWrite: true }]);
  });
});

describe('registry', () => {
  it('lists every action as a permission with default scope ALL', () => {
    const rows = permissionRows(coreManifest);
    expect(rows.find((r) => r.key === 'core.audit.view')?.scopes).toEqual([
      'ALL',
    ]);
    expect(rows.find((r) => r.key === 'core.users.view')?.scopes).toEqual([
      'DEPARTMENT',
      'ALL',
    ]);
  });

  it('applies default grants only to newly seen permissions', () => {
    const manifest = {
      ...coreManifest,
      defaultGrants: { stores_manager: { '*': 'ALL' as const } },
    };
    const grants = defaultGrantsFor(manifest, new Set(['core.audit.view']));
    expect(grants).toEqual([
      {
        roleKey: 'stores_manager',
        permissionKey: 'core.audit.view',
        scope: 'ALL',
      },
    ]);
  });

  it('hashes the catalog deterministically', () => {
    const a = catalogHash({ modules: [coreManifest], entities: [entity] });
    expect(a).toBe(
      catalogHash({ modules: [coreManifest], entities: [entity] }),
    );
    expect(a).not.toBe(catalogHash({ modules: [coreManifest], entities: [] }));
  });
});

describe('audit helpers', () => {
  it('redacts plain Restricted values but keeps ciphertext', () => {
    const plainDef = defineEntity<'secret' | 'name'>({
      key: 'inventory.p',
      moduleKey: 'inventory',
      label: 'P',
      table: 'inventory.p',
      fields: {
        secret: { label: 'S', tier: 'RESTRICTED' },
        name: { label: 'N', tier: 'INTERNAL' },
      },
    });
    expect(sanitizeForAudit(plainDef, { secret: 's3', name: 'n' })).toEqual({
      secret: REDACTED,
      name: 'n',
    });
    expect(sanitizeForAudit(entity, { cost: 'v1:k:iv:ct' })).toEqual({
      cost: 'v1:k:iv:ct',
    });
  });

  it('lists changed fields', () => {
    expect(changedFields({ a: 1, b: 2 }, { a: 1, b: 3, c: 4 })).toEqual([
      'b',
      'c',
    ]);
  });

  it('filters audit values by the viewer’s field access', () => {
    expect(visibleValues({ name: 'n', phone: '1' }, new Set(['name']))).toEqual(
      { name: 'n' },
    );
    expect(visibleValues({ name: 'n' }, null)).toEqual({ name: 'n' });
  });

  it('round-trips cursors', () => {
    const at = new Date('2026-11-10T08:00:00.123Z');
    expect(decodeCursor(encodeCursor(at, 'abc'))).toEqual({
      occurredAt: at,
      id: 'abc',
    });
  });
});
