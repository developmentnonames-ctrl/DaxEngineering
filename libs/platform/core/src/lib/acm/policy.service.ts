import { Injectable } from '@nestjs/common';
import type { GrantScope } from '@dax/contracts';
import { PrismaService } from '@dax/platform-db';
import { type Policy, type PolicyCatalog, resolvePolicy } from './policy';

interface Versions {
  epoch: number;
  userVersion: number;
}

const MAX_ENTRIES = 1000;

@Injectable()
export class PolicyService {
  private readonly cache = new Map<string, Policy>();
  private catalogCache: {
    epoch: number;
    catalog: PolicyCatalog;
    enabled: ReadonlySet<string>;
  } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  private async versions(userId: string): Promise<Versions> {
    const rows = await this.prisma.$queryRaw<
      { epoch: number; user_version: number | null }[]
    >`
      SELECT (SELECT value FROM core.policy_epoch WHERE id = 1) AS epoch,
             (SELECT perm_version FROM core.user_profile WHERE user_id = ${userId}::uuid) AS user_version`;
    return {
      epoch: Number(rows[0]?.epoch ?? 0),
      userVersion: Number(rows[0]?.user_version ?? 1),
    };
  }

  private async catalog(epoch: number) {
    if (this.catalogCache?.epoch === epoch) return this.catalogCache;
    const [modules, permissions, fields] = await Promise.all([
      this.prisma.module.findMany({
        where: { removedAt: null },
        select: { key: true, enabled: true },
      }),
      this.prisma.permission.findMany({
        where: { removedAt: null },
        select: { key: true, moduleKey: true, scopes: true },
      }),
      this.prisma.field.findMany({
        where: { removedAt: null },
        select: {
          id: true,
          entityKey: true,
          name: true,
          tier: true,
          locked: true,
          writable: true,
          entity: { select: { moduleKey: true } },
        },
      }),
    ]);
    this.catalogCache = {
      epoch,
      enabled: new Set(modules.filter((m) => m.enabled).map((m) => m.key)),
      catalog: {
        permissions: new Map(
          permissions.map((p) => [
            p.key,
            { key: p.key, moduleKey: p.moduleKey, scopes: p.scopes },
          ]),
        ),
        fields: fields.map((f) => ({
          id: f.id,
          entityKey: f.entityKey,
          moduleKey: f.entity.moduleKey,
          name: f.name,
          tier: f.tier,
          locked: f.locked,
          writable: f.writable,
        })),
      },
    };
    return this.catalogCache;
  }

  async enabledModules(): Promise<ReadonlySet<string>> {
    const rows = await this.prisma.$queryRaw<{ value: number }[]>`
      SELECT value FROM core.policy_epoch WHERE id = 1`;
    return (await this.catalog(Number(rows[0]?.value ?? 0))).enabled;
  }

  async forUser(userId: string, now = new Date()): Promise<Policy> {
    const { epoch, userVersion } = await this.versions(userId);
    const version = `${epoch}.${userVersion}`;
    const key = `${userId}:${version}`;
    const cached = this.cache.get(key);
    if (cached && cached.validUntil > now.getTime()) return cached;

    const { catalog, enabled } = await this.catalog(epoch);
    const [roles, overrides, departments] = await Promise.all([
      this.prisma.userRole.findMany({
        where: { userId, role: { archivedAt: null } },
        select: {
          expiresAt: true,
          role: {
            select: {
              id: true,
              isSuperAdmin: true,
              require2fa: true,
              permissions: {
                select: { permissionKey: true, scope: true, storeIds: true },
              },
              fieldGrants: {
                select: { fieldId: true, canRead: true, canWrite: true },
              },
            },
          },
        },
      }),
      this.prisma.userPermissionOverride.findMany({
        where: { userId },
        select: {
          permissionKey: true,
          effect: true,
          scope: true,
          expiresAt: true,
        },
      }),
      this.prisma.userDepartment.findMany({
        where: { userId, department: { active: true } },
        select: { departmentId: true },
      }),
    ]);

    const policy = resolvePolicy({
      userId,
      departmentIds: departments.map((d) => d.departmentId),
      roles: roles.map((ur) => ({
        id: ur.role.id,
        isSuperAdmin: ur.role.isSuperAdmin,
        require2fa: ur.role.require2fa,
        expiresAt: ur.expiresAt,
        permissions: ur.role.permissions.map((p) => ({
          key: p.permissionKey,
          scope: p.scope as GrantScope,
          storeIds: p.storeIds,
        })),
        fieldGrants: ur.role.fieldGrants,
      })),
      overrides: overrides.map((o) => ({
        permissionKey: o.permissionKey,
        effect: o.effect,
        scope: o.scope as GrantScope | null,
        expiresAt: o.expiresAt,
      })),
      enabledModules: enabled,
      catalog,
      now,
      version,
    });

    if (this.cache.size >= MAX_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest) this.cache.delete(oldest);
    }
    for (const k of this.cache.keys()) {
      if (k.startsWith(`${userId}:`)) this.cache.delete(k);
    }
    this.cache.set(key, policy);
    return policy;
  }
}
