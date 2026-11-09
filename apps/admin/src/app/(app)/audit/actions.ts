'use server';

import { z } from 'zod';
import { AuditPage } from '@dax/platform-contract';
import { failure } from '../../../lib/action-errors';
import { api } from '../../../lib/server';
import { AuditFilters, auditPath } from './query';

const Payload = z.object({ filters: AuditFilters, cursor: z.string().min(1) });

export async function loadMoreAudit(
  payload: z.input<typeof Payload>,
): Promise<{ page: AuditPage | null; error?: string }> {
  const parsed = Payload.safeParse(payload);
  if (!parsed.success) return { page: null, error: 'Could not load more.' };
  try {
    const page = await api.request(
      auditPath(parsed.data.filters, parsed.data.cursor),
      (d) => AuditPage.parse(d),
    );
    return { page };
  } catch (error) {
    return { page: null, error: failure(error, 'Could not load more.').error };
  }
}
