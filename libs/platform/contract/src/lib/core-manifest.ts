import { defineModule, type PermissionKeysOf } from '@dax/contracts';

export const CORE_MODULE_KEY = 'core';

export const coreManifest = defineModule({
  key: CORE_MODULE_KEY,
  name: 'Platform',
  description:
    'Users, roles, departments, modules, numbering and the audit log.',
  dependsOn: [],
  features: {
    admin: {
      name: 'Admin panel',
      actions: { access: { label: 'Open the admin panel' } },
    },
    users: {
      name: 'User accounts',
      actions: {
        view: { scopes: ['DEPARTMENT', 'ALL'] },
        create: { scopes: ['DEPARTMENT', 'ALL'] },
        edit: { scopes: ['DEPARTMENT', 'ALL'] },
        lock: {
          label: 'Unlock, deactivate and send password links',
          scopes: ['DEPARTMENT', 'ALL'],
        },
        assign_roles: {
          label: 'Assign roles and departments',
          scopes: ['DEPARTMENT', 'ALL'],
        },
        override: {
          label: 'Grant or deny single permissions',
          scopes: ['DEPARTMENT', 'ALL'],
        },
      },
    },
    roles: {
      name: 'Roles and field access',
      actions: { view: {}, manage: {} },
    },
    departments: { name: 'Departments', actions: { view: {}, manage: {} } },
    modules: {
      name: 'Modules',
      actions: { view: {}, manage: { label: 'Turn modules on and off' } },
    },
    numbering: {
      name: 'Document numbering',
      actions: { view: {}, manage: {} },
    },
    audit: { name: 'Audit log', actions: { view: {}, export: {} } },
  },
  menu: [
    {
      key: 'users',
      label: 'Users',
      path: '/users',
      permission: 'core.users.view',
    },
    {
      key: 'roles',
      label: 'Roles',
      path: '/roles',
      permission: 'core.roles.view',
    },
    {
      key: 'departments',
      label: 'Departments',
      path: '/departments',
      permission: 'core.departments.view',
    },
    {
      key: 'modules',
      label: 'Modules',
      path: '/modules',
      permission: 'core.modules.view',
    },
    {
      key: 'numbering',
      label: 'Numbering',
      path: '/numbering',
      permission: 'core.numbering.view',
    },
    {
      key: 'audit',
      label: 'Audit log',
      path: '/audit',
      permission: 'core.audit.view',
    },
  ],
});

export type CorePermission = PermissionKeysOf<typeof coreManifest>;

export const SEEDED_DEPARTMENTS = [
  { key: 'stores', name: 'Stores' },
  { key: 'parts_sales', name: 'Parts Sales' },
  { key: 'workshop', name: 'Workshop' },
  { key: 'sales', name: 'Sales' },
  { key: 'accounts', name: 'Accounts' },
  { key: 'commercial', name: 'Commercial' },
  { key: 'finance', name: 'Finance' },
  { key: 'management', name: 'Management' },
] as const;

export const SCOPE_RANK = { OWN: 1, DEPARTMENT: 2, ALL: 3 } as const;
