import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
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
import { z } from 'zod';
import type { GrantScope } from '@dax/contracts';
import {
  type RoleDetail,
  RoleGrantsInput,
  RoleInput,
  type RoleList,
} from '@dax/platform-contract';
import { PrismaService, type TransactionClient } from '@dax/platform-db';
import {
  canHandOut,
  canHandOutField,
  type Policy,
  SCOPE_RANK,
} from '../acm/policy';
import { AuditService } from '../audit/audit.service';
import type { DaxRequest } from '../auth/internal-caller';
import { AppOnly, Requires, sessionOf } from '../auth/session.guard';
import {
  assertCanHandOutRole,
  cannotGrant,
  defaultAccess,
  isUniqueViolation,
  normalizeFieldGrants,
  parse,
  stale,
} from './common';
import { loadFields } from './loaders';

const CopyInput = z.strictObject({ name: z.string().trim().min(1).max(60) });

const DETAIL = {
  id: true,
  key: true,
  name: true,
  description: true,
  isSystem: true,
  isSuperAdmin: true,
  require2fa: true,
  archivedAt: true,
  version: true,
  _count: { select: { users: true } },
  permissions: { select: { permissionKey: true, scope: true } },
  fieldGrants: { select: { fieldId: true, canRead: true, canWrite: true } },
} as const;

type Row = {
  id: string;
  key: string | null;
  name: string;
  description: string | null;
  isSystem: boolean;
  isSuperAdmin: boolean;
  require2fa: boolean;
  archivedAt: Date | null;
  version: number;
  _count: { users: number };
  permissions: { permissionKey: string; scope: GrantScope }[];
  fieldGrants: { fieldId: string; canRead: boolean; canWrite: boolean }[];
};

function toDetail(r: Row): RoleDetail {
  return {
    id: r.id,
    key: r.key,
    name: r.name,
    description: r.description,
    isSystem: r.isSystem,
    isSuperAdmin: r.isSuperAdmin,
    require2fa: r.require2fa,
    archived: r.archivedAt !== null,
    userCount: r._count.users,
    version: r.version,
    permissions: r.permissions
      .map((p) => ({ permissionKey: p.permissionKey, scope: p.scope }))
      .sort((a, b) => a.permissionKey.localeCompare(b.permissionKey)),
    fieldGrants: r.fieldGrants,
  };
}

function roleNameTaken(): never {
  throw new ConflictException({
    code: 'ROLE_EXISTS',
    message: 'A role with that name already exists.',
  });
}

@Controller('admin/roles')
@AppOnly('admin')
export class AdminRolesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async load(
    id: string,
    tx: TransactionClient = this.prisma,
  ): Promise<Row> {
    const row = (await tx.role.findUnique({
      where: { id },
      select: DETAIL,
    })) as Row | null;
    if (!row)
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Role not found.',
      });
    return row;
  }

  private guardSuperAdminRole(row: Row, policy: Policy): void {
    if (row.isSuperAdmin) {
      throw new ForbiddenException({
        code: 'SUPER_ADMIN_ROLE',
        message:
          'Super admins have every permission; this role cannot be changed.',
      });
    }
    if (!policy.isSuperAdmin && row.isSystem && row.key === 'super_admin') {
      cannotGrant('Super Admin');
    }
  }

  @Get()
  @Requires('core.roles.view')
  async list(): Promise<RoleList> {
    const rows = (await this.prisma.role.findMany({
      select: DETAIL,
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    })) as Row[];
    return {
      roles: rows.map((r) => {
        const { permissions: _p, fieldGrants: _f, ...summary } = toDetail(r);
        return summary;
      }),
    };
  }

  @Get(':id')
  @Requires('core.roles.view')
  async get(@Param('id', ParseUUIDPipe) id: string): Promise<RoleDetail> {
    return toDetail(await this.load(id));
  }

  @Post()
  @Requires('core.roles.manage')
  async create(@Body() body: unknown): Promise<RoleDetail> {
    const input = parse(RoleInput, body);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const role = await tx.role.create({
          data: {
            name: input.name,
            description: input.description,
            require2fa: input.require2fa,
          },
          select: { id: true },
        });
        await this.audit.record(
          {
            moduleKey: 'core',
            entityKey: 'core.role',
            entityId: role.id,
            action: 'create',
            after: input,
          },
          tx,
        );
        return toDetail(await this.load(role.id, tx));
      });
    } catch (error) {
      if (isUniqueViolation(error)) roleNameTaken();
      throw error;
    }
  }

  @Patch(':id')
  @Requires('core.roles.manage')
  async update(
    @Req() req: DaxRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<RoleDetail> {
    const { policy } = sessionOf(req);
    const input = parse(RoleInput, body);
    const before = await this.load(id);
    if (before.isSuperAdmin && !policy.isSuperAdmin) cannotGrant('Super Admin');
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.role.update({
          where: { id },
          data: {
            name: input.name,
            description: input.description,
            require2fa: before.isSuperAdmin ? true : input.require2fa,
            version: { increment: 1 },
          },
        });
        await this.audit.record(
          {
            moduleKey: 'core',
            entityKey: 'core.role',
            entityId: id,
            action: 'update',
            before: {
              name: before.name,
              description: before.description,
              require2fa: before.require2fa,
            },
            after: input,
          },
          tx,
        );
        return toDetail(await this.load(id, tx));
      });
    } catch (error) {
      if (isUniqueViolation(error)) roleNameTaken();
      throw error;
    }
  }

  @Put(':id/grants')
  @Requires('core.roles.manage')
  async grants(
    @Req() req: DaxRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<RoleDetail> {
    const { policy } = sessionOf(req);
    const input = parse(RoleGrantsInput, body);
    const before = await this.load(id);
    this.guardSuperAdminRole(before, policy);
    if (before.version !== input.version) stale();

    const keys = [...new Set(input.permissions.map((p) => p.permissionKey))];
    const catalog = new Map(
      (
        await this.prisma.permission.findMany({
          where: { key: { in: keys }, removedAt: null },
          select: { key: true, scopes: true },
        })
      ).map((p) => [p.key, p.scopes]),
    );
    const permissions = new Map<string, GrantScope>();
    for (const p of input.permissions) {
      const allowed = catalog.get(p.permissionKey);
      if (!allowed || !allowed.includes(p.scope)) {
        throw new BadRequestException({
          code: 'INVALID_INPUT',
          message: `Scope ${p.scope} is not available for ${p.permissionKey}.`,
          fields: ['permissions'],
        });
      }
      permissions.set(p.permissionKey, p.scope);
    }

    const fields = await loadFields(this.prisma);
    const fieldGrants = normalizeFieldGrants(input.fieldGrants, fields);

    if (!policy.isSuperAdmin) {
      const old = new Map(
        before.permissions.map((p) => [p.permissionKey, p.scope]),
      );
      for (const [key, scope] of permissions) {
        const was = old.get(key);
        const widened = !was || SCOPE_RANK[scope] > SCOPE_RANK[was];
        if (widened && !canHandOut(policy, key, scope)) cannotGrant(key);
      }
      const oldFields = new Map(before.fieldGrants.map((g) => [g.fieldId, g]));
      for (const g of fieldGrants) {
        const f = fields.get(g.fieldId);
        if (!f) continue;
        const was = oldFields.get(g.fieldId) ?? {
          canRead: defaultAccess(f).read,
          canWrite: defaultAccess(f).write,
        };
        const wants = {
          read: g.canRead && !was.canRead,
          write: g.canWrite && !was.canWrite,
        };
        if (!canHandOutField(policy, f.entityKey, f.name, wants)) {
          cannotGrant(`${f.entityKey}.${f.name}`);
        }
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const bumped = await tx.role.updateMany({
        where: { id, version: input.version },
        data: { version: { increment: 1 } },
      });
      if (bumped.count === 0) stale();
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      if (permissions.size) {
        await tx.rolePermission.createMany({
          data: [...permissions].map(([permissionKey, scope]) => ({
            roleId: id,
            permissionKey,
            scope,
            storeIds: [],
          })),
        });
      }
      await tx.roleFieldGrant.deleteMany({ where: { roleId: id } });
      if (fieldGrants.length) {
        await tx.roleFieldGrant.createMany({
          data: fieldGrants.map((g) => ({ roleId: id, ...g })),
        });
      }
      await this.audit.record(
        {
          moduleKey: 'core',
          entityKey: 'core.role',
          entityId: id,
          action: 'grants_changed',
          before: {
            permissions: Object.fromEntries(
              before.permissions.map((p) => [p.permissionKey, p.scope]),
            ),
            fieldGrants: before.fieldGrants.length,
          },
          after: {
            permissions: Object.fromEntries(permissions),
            fieldGrants: fieldGrants.length,
          },
        },
        tx,
      );
      return toDetail(await this.load(id, tx));
    });
  }

  private async setArchived(req: DaxRequest, id: string, archived: boolean) {
    const { policy } = sessionOf(req);
    const row = await this.load(id);
    this.guardSuperAdminRole(row, policy);
    if (row.isSystem && archived) {
      throw new BadRequestException({
        code: 'SYSTEM_ROLE',
        message: 'Built-in roles can be edited but not archived.',
      });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.role.update({
        where: { id },
        data: {
          archivedAt: archived ? new Date() : null,
          version: { increment: 1 },
        },
      });
      await this.audit.record(
        {
          moduleKey: 'core',
          entityKey: 'core.role',
          entityId: id,
          action: archived ? 'archived' : 'restored',
        },
        tx,
      );
    });
  }

  @Post(':id/archive')
  @Requires('core.roles.manage')
  @HttpCode(204)
  async archive(
    @Req() req: DaxRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.setArchived(req, id, true);
  }

  @Post(':id/restore')
  @Requires('core.roles.manage')
  @HttpCode(204)
  async restore(
    @Req() req: DaxRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.setArchived(req, id, false);
  }

  @Post(':id/copy')
  @Requires('core.roles.manage')
  async copy(
    @Req() req: DaxRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<RoleDetail> {
    const { policy } = sessionOf(req);
    const { name } = parse(CopyInput, body);
    const source = await this.load(id);
    if (source.isSuperAdmin) cannotGrant('Super Admin');
    assertCanHandOutRole(policy, source, await loadFields(this.prisma));
    try {
      return await this.prisma.$transaction(async (tx) => {
        const role = await tx.role.create({
          data: {
            name,
            description: source.description,
            require2fa: source.require2fa,
          },
          select: { id: true },
        });
        if (source.permissions.length) {
          await tx.rolePermission.createMany({
            data: source.permissions.map((p) => ({
              roleId: role.id,
              permissionKey: p.permissionKey,
              scope: p.scope,
              storeIds: [],
            })),
          });
        }
        if (source.fieldGrants.length) {
          await tx.roleFieldGrant.createMany({
            data: source.fieldGrants.map((g) => ({ roleId: role.id, ...g })),
          });
        }
        await this.audit.record(
          {
            moduleKey: 'core',
            entityKey: 'core.role',
            entityId: role.id,
            action: 'copied',
            after: { from: id, name },
          },
          tx,
        );
        return toDetail(await this.load(role.id, tx));
      });
    } catch (error) {
      if (isUniqueViolation(error)) roleNameTaken();
      throw error;
    }
  }
}
