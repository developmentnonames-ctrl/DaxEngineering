import type { FieldTier } from '@dax/contracts';

export interface FieldMeta {
  label: string;
  tier: FieldTier;
  encrypted?: boolean;
  locked?: boolean;
  writable?: boolean;
  group?: string;
  filterable?: boolean;
  sortable?: boolean;
  column?: string;
}

export interface EntityDef<F extends string = string> {
  key: string;
  moduleKey: string;
  label: string;
  table: string;
  fields: Readonly<Record<F, FieldMeta>>;
}

export class EntityError extends Error {}

export function snakeCase(name: string): string {
  return name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

export function columnOf(def: EntityDef, field: string): string {
  return def.fields[field]?.column ?? snakeCase(field);
}

export function defineEntity<F extends string>(
  def: EntityDef<F>,
): EntityDef<F> {
  if (!def.key.startsWith(`${def.moduleKey}.`)) {
    throw new EntityError(
      `Entity "${def.key}" must start with its module key "${def.moduleKey}."`,
    );
  }
  if (!/^[a-z_]+\.[a-z_]+$/.test(def.table)) {
    throw new EntityError(`Entity "${def.key}" table must be schema.table`);
  }
  for (const [name, meta] of Object.entries<FieldMeta>(def.fields)) {
    if (meta.encrypted && meta.tier !== 'RESTRICTED') {
      throw new EntityError(
        `${def.key}.${name}: only Restricted fields are encrypted`,
      );
    }
    if (meta.locked && meta.tier !== 'INTERNAL') {
      throw new EntityError(
        `${def.key}.${name}: locked fields must be Internal`,
      );
    }
    if (meta.encrypted && (meta.filterable || meta.sortable)) {
      throw new EntityError(
        `${def.key}.${name}: encrypted fields can't be filtered or sorted`,
      );
    }
  }
  return def;
}
