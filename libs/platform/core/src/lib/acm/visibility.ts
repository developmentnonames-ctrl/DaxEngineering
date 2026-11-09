import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { EntityDef } from './entity';
import { grantOf, type Policy, readableFields, writableFields } from './policy';

export type Decryptor = (
  entityKey: string,
  field: string,
  rowId: string,
  value: string,
) => string;

export function buildSelect(
  def: EntityDef,
  policy: Policy,
): Record<string, true> {
  const readable = readableFields(policy, def.key);
  const select: Record<string, true> = {};
  for (const [name, meta] of Object.entries(def.fields)) {
    if (meta.locked || readable.has(name)) select[name] = true;
  }
  return select;
}

function plain(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (
    value !== null &&
    typeof value === 'object' &&
    'toFixed' in value &&
    typeof (value as { toString: unknown }).toString === 'function' &&
    (value as { constructor?: { name?: string } }).constructor?.name ===
      'Decimal'
  ) {
    return String(value);
  }
  if (typeof value === 'bigint') return value.toString();
  return value;
}

export interface Projection<T> {
  data: T;
  restrictedFields: string[];
}

export function project<T extends Record<string, unknown>>(
  def: EntityDef,
  policy: Policy,
  row: Record<string, unknown>,
  decrypt?: Decryptor,
): Projection<Partial<T>> {
  const readable = readableFields(policy, def.key);
  const out: Record<string, unknown> = {};
  const restrictedFields: string[] = [];
  for (const [name, meta] of Object.entries(def.fields)) {
    if (!(name in row)) continue;
    if (!meta.locked && !readable.has(name)) continue;
    let value = row[name];
    if (meta.encrypted && typeof value === 'string') {
      if (!decrypt) throw new Error(`No decryptor for ${def.key}.${name}`);
      value = decrypt(def.key, name, String(row['id']), value);
    }
    if (meta.tier === 'RESTRICTED' && value !== null && value !== undefined) {
      restrictedFields.push(name);
    }
    out[name] = plain(value);
  }
  return { data: out as Partial<T>, restrictedFields };
}

export function assertWritable(
  def: EntityDef,
  policy: Policy,
  input: Record<string, unknown>,
): void {
  const writable = writableFields(policy, def.key);
  const blocked = Object.keys(input).filter(
    (k) => input[k] !== undefined && !writable.has(k),
  );
  if (blocked.length) {
    throw new ForbiddenException({
      code: 'FIELD_NOT_WRITABLE',
      message: "You can't change some of these fields.",
      fields: blocked,
    });
  }
}

export interface ScopeColumns {
  own?: string;
  department?: string;
}

export type ScopeWhere = Record<string, unknown> & { readonly __scoped: true };

export function scopeWhere(
  policy: Policy,
  permission: string,
  columns: ScopeColumns,
): ScopeWhere {
  const grant = grantOf(policy, permission);
  if (!grant) {
    throw new ForbiddenException({
      code: 'PERMISSION_DENIED',
      message: "You don't have access to this.",
    });
  }
  const where: Record<string, unknown> = {};
  if (grant.scope === 'OWN') {
    if (!columns.own)
      throw new Error(`${permission}: OWN scope needs a column`);
    where[columns.own] = policy.userId;
  } else if (grant.scope === 'DEPARTMENT') {
    if (!columns.department)
      throw new Error(`${permission}: DEPARTMENT scope needs a column`);
    where[columns.department] = { in: [...policy.departmentIds] };
  }
  return where as ScopeWhere;
}

export function notFound(): never {
  throw new NotFoundException({ code: 'NOT_FOUND', message: 'Not found.' });
}
