import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import {
  type AdminUser,
  type AdminUserDetail,
  type AdminUserList,
  CreateUserInput,
  type EffectiveAccess,
  OverrideInput,
  type OverrideDto,
  UpdateUserInput,
  UserAccessInput,
} from '@dax/platform-contract';
import { Prisma, PrismaService } from '@dax/platform-db';
import { userEntity } from '../acm/platform-entities';
import { can, canHandOut, type Policy } from '../acm/policy';
import { PolicyService } from '../acm/policy.service';
import { assertWritable, buildSelect, project } from '../acm/visibility';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import type { DaxRequest } from '../auth/internal-caller';
import { AppOnly, Requires, sessionOf } from '../auth/session.guard';
import {
  assertCanHandOutRole,
  cannotGrant,
  isUniqueViolation,
  parse,
  scopeOf,
} from './common';
import { loadFields, loadRoleShapes } from './loaders';

const RELATIONS = {
  roles: {
    select: {
      expiresAt: true,
      role: { select: { id: true, name: true, isSuperAdmin: true } },
    },
  },
  departments: {
    select: { department: { select: { id: true, name: true } } },
  },
  accounts: {
    where: { providerId: 'credential', password: { not: null } },
    select: { id: true },
  },
} as const;

type Loaded = Record<string, unknown> & {
  id: string;
  isSuperAdmin: boolean;
  roles: {
    expiresAt: Date | null;
    role: { id: string; name: string; isSuperAdmin: boolean };
  }[];
  departments: { department: { id: string; name: string } }[];
  accounts: { id: string }[];
};

function moduleSelect(policy: Policy) {
  return {
    ...buildSelect(userEntity, policy),
    isSuperAdmin: true,
    active: true,
    twoFactorEnabled: true,
    lockedUntil: true,
    createdAt: true,
    ...RELATIONS,
  } as const;
}

function toAdminUser(policy: Policy, row: Loaded, now = new Date()): AdminUser {
  const { data } = project(userEntity, policy, row);
  const lockedUntil = row['lockedUntil'] as Date | null;
  return {
    id: row.id,
    name: String(row['name']),
    username: (data.username as string | null | undefined) ?? undefined,
    email: data.email as string | undefined,
    isSuperAdmin: row.isSuperAdmin,
    active: row['active'] === true,
    twoFactorEnabled: row['twoFactorEnabled'] === true,
    lockedUntil:
      lockedUntil && lockedUntil > now ? lockedUntil.toISOString() : null,
    hasPassword: row.accounts.length > 0,
    createdAt: (row['createdAt'] as Date).toISOString(),
    roles: row.roles.map((r) => ({
      id: r.role.id,
      name: r.role.name,
      isSuperAdmin: r.role.isSuperAdmin,
      expiresAt: r.expiresAt?.toISOString() ?? null,
    })),
    departments: row.departments.map((d) => d.department),
  };
}

function adminOnly(policy: Policy): boolean {
  const keys = [...policy.permissions.keys()];
  return (
    policy.isSuperAdmin ||
    (keys.length > 0 && keys.every((k) => k.startsWith('core.')))
  );
}

function inScope(policy: Policy, permission: string): Prisma.UserWhereInput {
  return scopeOf(policy, permission) === 'ALL'
    ? {}
    : {
        departments: {
          some: { departmentId: { in: [...policy.departmentIds] } },
        },
      };
}

@Controller('admin/users')
@AppOnly('admin')
export class AdminUsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policies: PolicyService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
  ) {}

  private async target(
    policy: Policy,
    permission: string,
    id: string,
    forChange: boolean,
  ): Promise<Loaded> {
    const row = (await this.prisma.user.findFirst({
      where: { id, ...inScope(policy, permission) },
      select: moduleSelect(policy),
    })) as unknown as Loaded | null;
    if (!row)
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'User not found.',
      });
    if (forChange && row.isSuperAdmin && !policy.isSuperAdmin) {
      cannotGrant('super admin accounts');
    }
    return row;
  }

  private assertDepartments(
    policy: Policy,
    permission: string,
    ids: readonly string[],
  ) {
    if (scopeOf(policy, permission) === 'ALL') return;
    if (
      ids.length === 0 ||
      ids.some((d) => !policy.departmentIds.includes(d))
    ) {
      cannotGrant('departments outside your own');
    }
  }

  private async assertRoles(policy: Policy, roleIds: readonly string[]) {
    if (roleIds.length === 0) return;
    const [shapes, fields] = await Promise.all([
      loadRoleShapes(this.prisma, roleIds),
      loadFields(this.prisma),
    ]);
    if (shapes.size !== new Set(roleIds).size) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: 'Unknown or archived role.',
        fields: ['roles'],
      });
    }
    for (const shape of shapes.values())
      assertCanHandOutRole(policy, shape, fields);
  }

  @Get()
  @Requires('core.users.view')
  async list(@Req() req: DaxRequest): Promise<AdminUserList> {
    const { policy } = sessionOf(req);
    const rows = (await this.prisma.user.findMany({
      where: inScope(policy, 'core.users.view'),
      select: moduleSelect(policy),
      orderBy: { name: 'asc' },
    })) as unknown as Loaded[];
    return { users: rows.map((r) => toAdminUser(policy, r)) };
  }

  @Get(':id')
  @Requires('core.users.view')
  async get(
    @Req() req: DaxRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AdminUserDetail> {
    const { policy } = sessionOf(req);
    const row = await this.target(policy, 'core.users.view', id, false);
    const overrides = await this.prisma.userPermissionOverride.findMany({
      where: { userId: id },
      orderBy: { createdAt: 'asc' },
    });
    return {
      ...toAdminUser(policy, row),
      overrides: overrides.map((o): OverrideDto => ({
        id: o.id,
        permissionKey: o.permissionKey,
        effect: o.effect,
        scope: o.scope,
        reason: o.reason,
        expiresAt: o.expiresAt?.toISOString() ?? null,
      })),
    };
  }

  @Post()
  @Requires('core.users.create')
  async create(
    @Req() req: DaxRequest,
    @Body() body: unknown,
  ): Promise<AdminUser> {
    const { policy } = sessionOf(req);
    const input = parse(CreateUserInput, body);
    assertWritable(userEntity, policy, {
      username: input.username,
      email: input.email,
    });
    this.assertDepartments(policy, 'core.users.create', input.departmentIds);
    if (input.roleIds.length) {
      if (!can(policy, 'core.users.assign_roles')) {
        cannotGrant('role assignment');
      }
      await this.assertRoles(policy, input.roleIds);
    }

    let id: string;
    try {
      id = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            name: input.name,
            email: input.email.toLowerCase(),
            username: input.username.toLowerCase(),
            displayUsername: input.username,
          },
          select: { id: true },
        });
        if (input.departmentIds.length) {
          await tx.userDepartment.createMany({
            data: input.departmentIds.map((departmentId) => ({
              userId: user.id,
              departmentId,
            })),
          });
        }
        if (input.roleIds.length) {
          await tx.userRole.createMany({
            data: input.roleIds.map((roleId) => ({
              userId: user.id,
              roleId,
              grantedBy: policy.userId,
            })),
          });
        }
        await this.audit.record(
          {
            moduleKey: 'core',
            entityKey: 'core.user',
            entityId: user.id,
            action: 'create',
            after: {
              name: input.name,
              username: input.username,
              email: input.email,
              departmentIds: input.departmentIds,
              roleIds: input.roleIds,
            },
          },
          tx,
        );
        return user.id;
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException({
          code: 'USER_EXISTS',
          message: 'That username or email is already in use.',
        });
      }
      throw error;
    }
    const row = (await this.prisma.user.findUniqueOrThrow({
      where: { id },
      select: moduleSelect(policy),
    })) as unknown as Loaded;
    await this.auth.sendPasswordLink(
      id,
      row.isSuperAdmin ? 'admin' : 'web',
      'invite',
    );
    return toAdminUser(policy, row);
  }

  @Patch(':id')
  @Requires('core.users.edit')
  async update(
    @Req() req: DaxRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<AdminUser> {
    const { policy } = sessionOf(req);
    const input = parse(UpdateUserInput, body);
    const before = await this.target(policy, 'core.users.edit', id, true);
    assertWritable(userEntity, policy, input);
    const data: Prisma.UserUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.email !== undefined) data.email = input.email.toLowerCase();
    if (input.username !== undefined) {
      data.username = input.username.toLowerCase();
      data.displayUsername = input.username;
    }
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id }, data });
        await this.audit.record(
          {
            moduleKey: 'core',
            entityKey: 'core.user',
            entityId: id,
            action: 'update',
            before: Object.fromEntries(
              Object.keys(input).map((k) => [k, before[k]]),
            ),
            after: input,
          },
          tx,
        );
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException({
          code: 'USER_EXISTS',
          message: 'That username or email is already in use.',
        });
      }
      throw error;
    }
    return toAdminUser(
      policy,
      await this.target(policy, 'core.users.view', id, false),
    );
  }

  @Put(':id/access')
  @Requires('core.users.assign_roles')
  async access(
    @Req() req: DaxRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<AdminUserDetail> {
    const { policy } = sessionOf(req);
    const input = parse(UserAccessInput, body);
    const before = await this.target(
      policy,
      'core.users.assign_roles',
      id,
      true,
    );

    const beforeRoles = new Set(before.roles.map((r) => r.role.id));
    const afterRoles = new Set(input.roles.map((r) => r.roleId));
    const changedRoles = [
      ...[...afterRoles].filter((r) => !beforeRoles.has(r)),
      ...[...beforeRoles].filter((r) => !afterRoles.has(r)),
    ];
    await this.assertRoles(
      policy,
      changedRoles.filter((r) => afterRoles.has(r)),
    );
    if (!policy.isSuperAdmin) {
      const removed = changedRoles.filter((r) => !afterRoles.has(r));
      const shapes = await loadRoleShapes(this.prisma, removed, true);
      const fields = await loadFields(this.prisma);
      for (const shape of shapes.values())
        assertCanHandOutRole(policy, shape, fields);
    }

    const beforeDepts = before.departments.map((d) => d.department.id);
    const touchedDepts = [
      ...input.departmentIds.filter((d) => !beforeDepts.includes(d)),
      ...beforeDepts.filter((d) => !input.departmentIds.includes(d)),
    ];
    if (touchedDepts.length) {
      this.assertDepartments(policy, 'core.users.assign_roles', touchedDepts);
    }
    if (id === policy.userId && !policy.isSuperAdmin && changedRoles.length) {
      cannotGrant('your own roles');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({
        where: { userId: id, roleId: { notIn: [...afterRoles] } },
      });
      for (const r of input.roles) {
        const expiresAt = r.expiresAt ? new Date(r.expiresAt) : null;
        await tx.userRole.upsert({
          where: { userId_roleId: { userId: id, roleId: r.roleId } },
          create: {
            userId: id,
            roleId: r.roleId,
            expiresAt,
            grantedBy: policy.userId,
          },
          update: { expiresAt },
        });
      }
      await tx.userDepartment.deleteMany({
        where: { userId: id, departmentId: { notIn: input.departmentIds } },
      });
      await tx.userDepartment.createMany({
        data: input.departmentIds.map((departmentId) => ({
          userId: id,
          departmentId,
        })),
        skipDuplicates: true,
      });
      await this.audit.record(
        {
          moduleKey: 'core',
          entityKey: 'core.user',
          entityId: id,
          action: 'access_changed',
          before: {
            roles: [...beforeRoles].sort(),
            departments: [...beforeDepts].sort(),
          },
          after: {
            roles: [...afterRoles].sort(),
            departments: [...input.departmentIds].sort(),
          },
        },
        tx,
      );
    });
    return this.get(req, id);
  }

  @Post(':id/overrides')
  @Requires('core.users.override')
  async addOverride(
    @Req() req: DaxRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<OverrideDto> {
    const { policy } = sessionOf(req);
    const input = parse(OverrideInput, body);
    await this.target(policy, 'core.users.override', id, true);
    const permission = await this.prisma.permission.findFirst({
      where: { key: input.permissionKey, removedAt: null },
    });
    if (!permission) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: 'Unknown permission.',
        fields: ['permissionKey'],
      });
    }
    const scope = input.effect === 'GRANT' ? (input.scope ?? 'ALL') : null;
    if (scope && !permission.scopes.includes(scope)) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: 'That scope is not available for this permission.',
        fields: ['scope'],
      });
    }
    if (!canHandOut(policy, input.permissionKey, scope ?? 'OWN')) {
      cannotGrant(input.permissionKey);
    }
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.userPermissionOverride.upsert({
        where: {
          userId_permissionKey: {
            userId: id,
            permissionKey: input.permissionKey,
          },
        },
        create: {
          userId: id,
          permissionKey: input.permissionKey,
          effect: input.effect,
          scope,
          reason: input.reason,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          createdBy: policy.userId,
        },
        update: {
          effect: input.effect,
          scope,
          reason: input.reason,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          createdBy: policy.userId,
        },
      });
      await this.audit.record(
        {
          moduleKey: 'core',
          entityKey: 'core.user',
          entityId: id,
          action: 'override_set',
          after: {
            permissionKey: input.permissionKey,
            effect: input.effect,
            scope,
          },
          reason: input.reason,
        },
        tx,
      );
      return created;
    });
    return {
      id: row.id,
      permissionKey: row.permissionKey,
      effect: row.effect,
      scope: row.scope,
      reason: row.reason,
      expiresAt: row.expiresAt?.toISOString() ?? null,
    };
  }

  @Delete(':id/overrides/:overrideId')
  @Requires('core.users.override')
  @HttpCode(204)
  async removeOverride(
    @Req() req: DaxRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('overrideId', ParseUUIDPipe) overrideId: string,
  ): Promise<void> {
    const { policy } = sessionOf(req);
    await this.target(policy, 'core.users.override', id, true);
    const row = await this.prisma.userPermissionOverride.findFirst({
      where: { id: overrideId, userId: id },
    });
    if (!row)
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Not found.' });
    if (
      row.effect === 'DENY' &&
      !canHandOut(policy, row.permissionKey, 'OWN')
    ) {
      cannotGrant(row.permissionKey);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.userPermissionOverride.delete({ where: { id: overrideId } });
      await this.audit.record(
        {
          moduleKey: 'core',
          entityKey: 'core.user',
          entityId: id,
          action: 'override_removed',
          before: {
            permissionKey: row.permissionKey,
            effect: row.effect,
            scope: row.scope,
          },
        },
        tx,
      );
    });
  }

  private async accountAction(
    req: DaxRequest,
    id: string,
    action: string,
    run: (tx: Prisma.TransactionClient) => Promise<unknown>,
  ): Promise<void> {
    const { policy } = sessionOf(req);
    await this.target(policy, 'core.users.lock', id, true);
    await this.prisma.$transaction(async (tx) => {
      await run(tx);
      await this.audit.record(
        { moduleKey: 'core', entityKey: 'core.user', entityId: id, action },
        tx,
      );
    });
  }

  @Post(':id/unlock')
  @Requires('core.users.lock')
  @HttpCode(204)
  async unlock(@Req() req: DaxRequest, @Param('id', ParseUUIDPipe) id: string) {
    await this.accountAction(req, id, 'unlocked', async (tx) => {
      await tx.user.update({
        where: { id },
        data: { failedLoginCount: 0, lockedUntil: null },
      });
      await tx.twoFactor.updateMany({
        where: { userId: id },
        data: { failedVerificationCount: 0, lockedUntil: null },
      });
    });
  }

  @Post(':id/deactivate')
  @Requires('core.users.lock')
  @HttpCode(204)
  async deactivate(
    @Req() req: DaxRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    if (id === sessionOf(req).user.id) {
      throw new BadRequestException({
        code: 'CANNOT_DEACTIVATE_SELF',
        message: "You can't deactivate your own account.",
      });
    }
    await this.accountAction(req, id, 'deactivated', async (tx) => {
      await tx.user.update({ where: { id }, data: { active: false } });
      await tx.session.deleteMany({ where: { userId: id } });
    });
  }

  @Post(':id/activate')
  @Requires('core.users.lock')
  @HttpCode(204)
  async activate(
    @Req() req: DaxRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.accountAction(req, id, 'activated', (tx) =>
      tx.user.update({ where: { id }, data: { active: true } }),
    );
  }

  @Post(':id/password-link')
  @Requires('core.users.lock')
  @HttpCode(204)
  async passwordLink(
    @Req() req: DaxRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const { policy } = sessionOf(req);
    const row = await this.target(policy, 'core.users.lock', id, true);
    if (row['active'] !== true) {
      throw new BadRequestException({
        code: 'USER_INACTIVE',
        message: 'Activate the account first.',
      });
    }
    const target = await this.policies.forUser(id);
    await this.auth.sendPasswordLink(
      id,
      adminOnly(target) ? 'admin' : 'web',
      row.accounts.length ? 'reset' : 'invite',
    );
    await this.audit.record({
      moduleKey: 'core',
      entityKey: 'core.user',
      entityId: id,
      action: 'password_link_sent',
    });
  }

  @Get(':id/effective-access')
  @Requires('core.users.view')
  async effective(
    @Req() req: DaxRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<EffectiveAccess> {
    const { policy } = sessionOf(req);
    await this.target(policy, 'core.users.view', id, false);
    const target = await this.policies.forUser(id);
    return {
      isSuperAdmin: target.isSuperAdmin,
      require2fa: target.require2fa,
      permissions: [...target.permissions]
        .map(([key, g]) => ({
          key,
          scope: g.scope,
          source: target.sources.get(key) ?? 'role',
        }))
        .sort((a, b) => a.key.localeCompare(b.key)),
      denied: [...target.denied].sort(),
      fields: Object.fromEntries(
        [...target.fields].map(([entity, f]) => [
          entity,
          { read: [...f.read].sort(), write: [...f.write].sort() },
        ]),
      ),
    };
  }
}
