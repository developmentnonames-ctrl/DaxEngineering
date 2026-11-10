import { z } from 'zod';

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const AuditFilters = z.object({
  entityKey: z.string().trim().max(100).optional(),
  entityId: z.string().trim().max(100).optional(),
  actorId: z.uuid().optional(),
  action: z.string().trim().max(60).optional(),
  from: Day.optional(),
  to: Day.optional(),
});
export type AuditFilters = z.infer<typeof AuditFilters>;

// Matches the API: 25 rows by default, at most 100.
const Paging = z.object({
  page: z.coerce.number().int().min(1).max(100_000).catch(1),
  limit: z.coerce.number().int().min(1).max(100).catch(25),
});
export type Paging = z.infer<typeof Paging>;

/** The page and rows-per-page from the URL; bad values fall back to the defaults. */
export function readPaging(
  params: Record<string, string | string[] | undefined>,
): Paging {
  const one = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;
  return Paging.parse({
    page: one(params['page']) ?? 1,
    limit: one(params['limit']) ?? 25,
  });
}

export function readFilters(
  params: Record<string, string | string[] | undefined>,
): { filters: AuditFilters; valid: boolean } {
  const raw: Record<string, string> = {};
  for (const key of Object.keys(AuditFilters.shape)) {
    const value = params[key];
    if (typeof value === 'string' && value.trim()) raw[key] = value.trim();
  }
  const parsed = AuditFilters.safeParse(raw);
  return parsed.success
    ? { filters: parsed.data, valid: true }
    : { filters: {}, valid: false };
}

export function auditPath(filters: AuditFilters, paging: Paging): string {
  const q = new URLSearchParams();
  if (filters.entityKey) q.set('entityKey', filters.entityKey);
  if (filters.entityId) q.set('entityId', filters.entityId);
  if (filters.actorId) q.set('actorId', filters.actorId);
  if (filters.action) q.set('action', filters.action);
  if (filters.from) q.set('from', `${filters.from}T00:00:00+05:30`);
  if (filters.to) q.set('to', `${filters.to}T23:59:59.999+05:30`);
  q.set('page', String(paging.page));
  q.set('limit', String(paging.limit));
  return `/admin/audit?${q.toString()}`;
}
