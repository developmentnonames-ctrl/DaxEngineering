import type { z } from 'zod';

export type RawSearchParams = Record<string, string | string[] | undefined>;
export type SearchParams = Promise<RawSearchParams>;
export type Query = Record<string, string | undefined>;

export function flatten(raw: RawSearchParams): Query {
  return Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  );
}

export function toQuery(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

/** Parses list filters with a contract schema, dropping the ones that fail. */
export function readQuery<S extends z.ZodType>(
  schema: S,
  raw: Query,
): z.output<S> {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return parsed.data;
  const bad = new Set(parsed.error.issues.map((i) => String(i.path[0])));
  const kept = Object.fromEntries(
    Object.entries(raw).filter(([k]) => !bad.has(k)),
  );
  return schema.parse(kept);
}
