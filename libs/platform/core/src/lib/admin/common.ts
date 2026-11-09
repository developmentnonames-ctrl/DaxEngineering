import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import type { FieldTier, GrantScope } from '@dax/contracts';
import type { z } from 'zod';
import {
  canHandOut,
  canHandOutField,
  grantOf,
  type Policy,
} from '../acm/policy';

export function parse<T extends z.ZodType>(
  schema: T,
  input: unknown,
): z.infer<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new BadRequestException({
      code: 'INVALID_INPUT',
      message: 'Check the highlighted fields.',
      fields: [...new Set(parsed.error.issues.map((i) => i.path.join('.')))],
    });
  }
  return parsed.data;
}

export function cannotGrant(what: string): never {
  throw new ForbiddenException({
    code: 'CANNOT_GRANT',
    message: `You can only hand out access you have yourself (${what}).`,
  });
}

export function stale(): never {
  throw new ConflictException({
    code: 'STALE',
    message: 'Someone else changed this. Reload and try again.',
  });
}

export function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string }).code === 'P2002';
}

export interface FieldInfo {
  id: string;
  entityKey: string;
  name: string;
  tier: FieldTier;
  locked: boolean;
  writable: boolean;
}

export function defaultAccess(f: FieldInfo): { read: boolean; write: boolean } {
  const read = f.locked || f.tier === 'INTERNAL';
  return { read, write: read && f.writable && f.tier === 'INTERNAL' };
}

export function normalizeFieldGrants(
  grants: readonly { fieldId: string; canRead: boolean; canWrite: boolean }[],
  fields: ReadonlyMap<string, FieldInfo>,
): { fieldId: string; canRead: boolean; canWrite: boolean }[] {
  const out = new Map<
    string,
    { fieldId: string; canRead: boolean; canWrite: boolean }
  >();
  for (const g of grants) {
    const f = fields.get(g.fieldId);
    if (!f) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: 'Unknown field in field access.',
        fields: ['fieldGrants'],
      });
    }
    const canRead = f.locked || g.canRead;
    const canWrite = canRead && f.writable && g.canWrite;
    const d = defaultAccess(f);
    if (canRead === d.read && canWrite === d.write) {
      out.delete(f.id);
      continue;
    }
    out.set(f.id, { fieldId: f.id, canRead, canWrite });
  }
  return [...out.values()];
}

export interface RoleShape {
  isSuperAdmin: boolean;
  permissions: readonly { permissionKey: string; scope: GrantScope }[];
  fieldGrants: readonly {
    fieldId: string;
    canRead: boolean;
    canWrite: boolean;
  }[];
}

export function assertCanHandOutRole(
  actor: Policy,
  role: RoleShape,
  fields: ReadonlyMap<string, FieldInfo>,
): void {
  if (actor.isSuperAdmin) return;
  if (role.isSuperAdmin) cannotGrant('Super Admin');
  for (const p of role.permissions) {
    if (!canHandOut(actor, p.permissionKey, p.scope))
      cannotGrant(p.permissionKey);
  }
  for (const g of role.fieldGrants) {
    const f = fields.get(g.fieldId);
    if (!f) continue;
    if (
      !canHandOutField(actor, f.entityKey, f.name, {
        read: g.canRead,
        write: g.canWrite,
      })
    ) {
      cannotGrant(`${f.entityKey}.${f.name}`);
    }
  }
}

export function scopeOf(policy: Policy, permission: string): GrantScope {
  const grant = grantOf(policy, permission);
  if (!grant) {
    throw new ForbiddenException({
      code: 'PERMISSION_DENIED',
      message: "You don't have access to this.",
    });
  }
  return grant.scope;
}
