import { z } from 'zod';
import { FIELD_TIERS, GRANT_SCOPES, PageParams } from '@dax/contracts';
import { APP_NAMES, PendingStep, Username } from './auth';

export const Scope = z.enum(GRANT_SCOPES);
export const Tier = z.enum(FIELD_TIERS);
const Id = z.uuid();
const IsoDate = z.string();

export const CatalogAction = z.object({
  permissionKey: z.string(),
  action: z.string(),
  label: z.string(),
  description: z.string().nullable(),
  scopes: z.array(Scope),
  isApproval: z.boolean(),
});
export const CatalogField = z.object({
  id: Id,
  name: z.string(),
  label: z.string(),
  tier: Tier,
  locked: z.boolean(),
  writable: z.boolean(),
  encrypted: z.boolean(),
  group: z.string().nullable(),
});
export const AdminCatalog = z.object({
  modules: z.array(
    z.object({
      key: z.string(),
      name: z.string(),
      description: z.string().nullable(),
      enabled: z.boolean(),
      toggleable: z.boolean(),
      dependsOn: z.array(z.string()),
      features: z.array(
        z.object({
          key: z.string(),
          name: z.string(),
          actions: z.array(CatalogAction),
        }),
      ),
    }),
  ),
  entities: z.array(
    z.object({
      key: z.string(),
      moduleKey: z.string(),
      label: z.string(),
      fields: z.array(CatalogField),
    }),
  ),
});
export type AdminCatalog = z.infer<typeof AdminCatalog>;

export const DepartmentDto = z.object({
  id: Id,
  key: z.string(),
  name: z.string(),
  active: z.boolean(),
  memberCount: z.number().int(),
});
export type DepartmentDto = z.infer<typeof DepartmentDto>;
export const DepartmentList = z.object({ departments: z.array(DepartmentDto) });
export type DepartmentList = z.infer<typeof DepartmentList>;
export const DepartmentInput = z.strictObject({
  name: z.string().trim().min(1).max(60),
  active: z.boolean().default(true),
});
export type DepartmentInput = z.infer<typeof DepartmentInput>;

export const RoleSummary = z.object({
  id: Id,
  key: z.string().nullable(),
  name: z.string(),
  description: z.string().nullable(),
  isSystem: z.boolean(),
  isSuperAdmin: z.boolean(),
  require2fa: z.boolean(),
  archived: z.boolean(),
  userCount: z.number().int(),
  version: z.number().int(),
});
export type RoleSummary = z.infer<typeof RoleSummary>;
export const RoleList = z.object({ roles: z.array(RoleSummary) });
export type RoleList = z.infer<typeof RoleList>;
export const RoleGrant = z.object({ permissionKey: z.string(), scope: Scope });
export const RoleFieldGrantDto = z.object({
  fieldId: Id,
  canRead: z.boolean(),
  canWrite: z.boolean(),
});
export const RoleDetail = RoleSummary.extend({
  permissions: z.array(RoleGrant),
  fieldGrants: z.array(RoleFieldGrantDto),
});
export type RoleDetail = z.infer<typeof RoleDetail>;
export const RoleInput = z.strictObject({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(300).nullable().default(null),
  require2fa: z.boolean().default(false),
});
export type RoleInput = z.infer<typeof RoleInput>;
export const RoleGrantsInput = z.strictObject({
  version: z.number().int(),
  permissions: z.array(RoleGrant),
  fieldGrants: z.array(RoleFieldGrantDto),
});
export type RoleGrantsInput = z.infer<typeof RoleGrantsInput>;

export const UserRoleDto = z.object({
  id: Id,
  name: z.string(),
  isSuperAdmin: z.boolean(),
  expiresAt: IsoDate.nullable(),
});
export const AdminUser = z.object({
  id: Id,
  name: z.string(),
  username: z.string().nullable().optional(),
  email: z.string().optional(),
  isSuperAdmin: z.boolean(),
  active: z.boolean(),
  twoFactorEnabled: z.boolean(),
  lockedUntil: IsoDate.nullable(),
  hasPassword: z.boolean(),
  createdAt: IsoDate,
  roles: z.array(UserRoleDto),
  departments: z.array(z.object({ id: Id, name: z.string() })),
});
export type AdminUser = z.infer<typeof AdminUser>;
export const USER_STATUS_FILTERS = [
  'all',
  'active',
  'invited',
  'locked',
  'deactivated',
] as const;
export type UserStatusFilter = (typeof USER_STATUS_FILTERS)[number];

/** Users are few, so pickers (e.g. the audit "who" filter) may ask for up to 500. */
export const USER_LIST_MAX = 500;
export const AdminUserQuery = PageParams.extend({
  q: z.string().trim().max(100).optional(),
  status: z.enum(USER_STATUS_FILTERS).default('all'),
  limit: z.coerce.number().int().min(1).max(USER_LIST_MAX).default(25),
});
export type AdminUserQuery = z.infer<typeof AdminUserQuery>;

export const AdminUserList = z.object({
  users: z.array(AdminUser),
  total: z.int().min(0),
  page: z.int().min(1),
  limit: z.int().min(1),
});
export type AdminUserList = z.infer<typeof AdminUserList>;

export const OverrideDto = z.object({
  id: Id,
  permissionKey: z.string(),
  effect: z.enum(['GRANT', 'DENY']),
  scope: Scope.nullable(),
  reason: z.string(),
  expiresAt: IsoDate.nullable(),
});
export type OverrideDto = z.infer<typeof OverrideDto>;
export const AdminUserDetail = AdminUser.extend({
  overrides: z.array(OverrideDto),
});
export type AdminUserDetail = z.infer<typeof AdminUserDetail>;

export const CreateUserInput = z.strictObject({
  name: z.string().trim().min(1).max(100),
  username: Username,
  email: z.email().max(254),
  departmentIds: z.array(Id).default([]),
  roleIds: z.array(Id).default([]),
});
export type CreateUserInput = z.infer<typeof CreateUserInput>;
export const UpdateUserInput = z.strictObject({
  name: z.string().trim().min(1).max(100).optional(),
  username: Username.optional(),
  email: z.email().max(254).optional(),
});
export type UpdateUserInput = z.infer<typeof UpdateUserInput>;
export const UserAccessInput = z.strictObject({
  roles: z.array(
    z.object({ roleId: Id, expiresAt: IsoDate.nullable().default(null) }),
  ),
  departmentIds: z.array(Id),
});
export type UserAccessInput = z.infer<typeof UserAccessInput>;
export const OverrideInput = z.strictObject({
  permissionKey: z.string().min(1),
  effect: z.enum(['GRANT', 'DENY']),
  scope: Scope.nullable().default(null),
  reason: z.string().trim().min(3).max(300),
  expiresAt: IsoDate.nullable().default(null),
});
export type OverrideInput = z.infer<typeof OverrideInput>;

export const FieldSets = z.record(
  z.string(),
  z.object({ read: z.array(z.string()), write: z.array(z.string()) }),
);
export const EffectiveAccess = z.object({
  isSuperAdmin: z.boolean(),
  require2fa: z.boolean(),
  permissions: z.array(
    z.object({
      key: z.string(),
      scope: Scope,
      source: z.enum(['role', 'override', 'super_admin']),
    }),
  ),
  denied: z.array(z.string()),
  fields: FieldSets,
});
export type EffectiveAccess = z.infer<typeof EffectiveAccess>;

export const ModuleToggleInput = z.strictObject({ enabled: z.boolean() });
export const ModuleToggleResult = z.object({
  enabled: z.boolean(),
  restartRequired: z.boolean(),
});
export type ModuleToggleResult = z.infer<typeof ModuleToggleResult>;

export const NumberSeriesDto = z.object({
  id: Id,
  moduleKey: z.string(),
  docType: z.string(),
  subtype: z.string(),
  name: z.string(),
  pattern: z.string(),
  padding: z.number().int(),
  active: z.boolean(),
  preview: z.string(),
});
export type NumberSeriesDto = z.infer<typeof NumberSeriesDto>;
export const NumberSeriesList = z.object({ series: z.array(NumberSeriesDto) });
export type NumberSeriesList = z.infer<typeof NumberSeriesList>;
export const NumberSeriesInput = z.strictObject({
  pattern: z
    .string()
    .trim()
    .min(5)
    .max(60)
    .refine((p) => p.includes('{SEQ}'), 'Pattern needs {SEQ}'),
  padding: z.number().int().min(1).max(8),
  active: z.boolean(),
});
export type NumberSeriesInput = z.infer<typeof NumberSeriesInput>;

export const AuditEntry = z.object({
  id: Id,
  occurredAt: IsoDate,
  actorId: z.string().nullable(),
  actorName: z.string().nullable(),
  app: z.string().nullable(),
  moduleKey: z.string(),
  entityKey: z.string(),
  entityId: z.string().nullable(),
  action: z.string(),
  before: z.record(z.string(), z.unknown()).nullable(),
  after: z.record(z.string(), z.unknown()).nullable(),
  changedFields: z.array(z.string()),
  reason: z.string().nullable(),
  restricted: z.boolean(),
});
export type AuditEntry = z.infer<typeof AuditEntry>;
export const AuditQuery = z
  .object({
    entityKey: z.string().optional(),
    entityId: z.string().optional(),
    actorId: z.uuid().optional(),
    action: z.string().optional(),
    from: IsoDate.optional(),
    to: IsoDate.optional(),
  })
  .extend(PageParams.shape);
export type AuditQuery = z.infer<typeof AuditQuery>;
export const AuditPage = z.object({
  entries: z.array(AuditEntry),
  total: z.int().min(0),
  page: z.int().min(1),
  limit: z.int().min(1),
});
export type AuditPage = z.infer<typeof AuditPage>;

export const Capabilities = z.object({
  user: z.object({ id: Id, name: z.string() }),
  app: z.enum(APP_NAMES),
  pending: PendingStep.nullable(),
  isSuperAdmin: z.boolean(),
  modules: z.array(z.object({ key: z.string(), name: z.string() })),
  menu: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      path: z.string(),
      moduleKey: z.string(),
      icon: z.string().nullable().default(null),
    }),
  ),
  permissions: z.record(z.string(), Scope),
  fields: FieldSets,
  policyVersion: z.string(),
});
export type Capabilities = z.infer<typeof Capabilities>;

export const AdminSummary = z.object({
  users: z.number().int(),
  active: z.number().int(),
  locked: z.number().int(),
  invited: z.number().int(),
  roles: z.number().int(),
  auditToday: z.number().int(),
});
export type AdminSummary = z.infer<typeof AdminSummary>;

export const DepartmentOptions = z.object({
  departments: z.array(z.object({ id: z.uuid(), name: z.string() })),
});
export type DepartmentOptions = z.infer<typeof DepartmentOptions>;
