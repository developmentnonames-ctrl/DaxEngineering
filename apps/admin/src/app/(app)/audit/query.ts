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

export function auditPath(filters: AuditFilters, cursor?: string): string {
  const q = new URLSearchParams();
  if (filters.entityKey) q.set('entityKey', filters.entityKey);
  if (filters.entityId) q.set('entityId', filters.entityId);
  if (filters.actorId) q.set('actorId', filters.actorId);
  if (filters.action) q.set('action', filters.action);
  if (filters.from) q.set('from', `${filters.from}T00:00:00+05:30`);
  if (filters.to) q.set('to', `${filters.to}T23:59:59.999+05:30`);
  if (cursor) q.set('cursor', cursor);
  q.set('limit', '50');
  return `/admin/audit?${q.toString()}`;
}
