import type { GrantScope } from '@dax/contracts';
import type { PrismaService } from '@dax/platform-db';
import type { FieldInfo, RoleShape } from './common';

export async function loadFields(
  prisma: PrismaService,
): Promise<Map<string, FieldInfo>> {
  const rows = await prisma.field.findMany({
    where: { removedAt: null },
    select: {
      id: true,
      entityKey: true,
      name: true,
      tier: true,
      locked: true,
      writable: true,
    },
  });
  return new Map(rows.map((f) => [f.id, f]));
}

export async function loadRoleShapes(
  prisma: PrismaService,
  roleIds: readonly string[],
  includeArchived = false,
): Promise<Map<string, RoleShape>> {
  if (roleIds.length === 0) return new Map();
  const rows = await prisma.role.findMany({
    where: {
      id: { in: [...roleIds] },
      ...(includeArchived ? {} : { archivedAt: null }),
    },
    select: {
      id: true,
      isSuperAdmin: true,
      permissions: { select: { permissionKey: true, scope: true } },
      fieldGrants: { select: { fieldId: true, canRead: true, canWrite: true } },
    },
  });
  return new Map(
    rows.map((r) => [
      r.id,
      {
        isSuperAdmin: r.isSuperAdmin,
        permissions: r.permissions.map((p) => ({
          permissionKey: p.permissionKey,
          scope: p.scope as GrantScope,
        })),
        fieldGrants: r.fieldGrants,
      },
    ]),
  );
}
