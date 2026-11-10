import 'server-only';
import { cache } from 'react';
import { z } from 'zod';
import {
  DiscrepancyDto,
  DiscrepancyPage,
  DiscrepancyQuery,
  GrnDto,
  GrnPage,
  GrnQuery,
  MovementPage,
  PutawayList,
  ReceivingSummary,
} from '@dax/inventory-contract';
import { load, optional, unlessForbidden } from '../../../../../lib/load';
import { type Query, readQuery, toQuery } from '../../../../../lib/query';
import { api } from '../../../../../lib/server';
import { MOVEMENTS_PER_PAGE } from './types';

export const DISCREPANCY_ENTITY = 'inventory.discrepancy';

export const Attachment = z.object({
  id: z.uuid(),
  kind: z.string(),
  fileName: z.string(),
  contentType: z.string(),
  size: z.number(),
  createdAt: z.string(),
});
export type Attachment = z.infer<typeof Attachment>;

export const getReceivingSummary = cache(() =>
  optional(
    api.request('/inventory/receiving/summary', (d) =>
      ReceivingSummary.parse(d),
    ),
  ),
);

export function listGrns(raw: Query) {
  return load(
    api.request(`/inventory/grns${toQuery(readQuery(GrnQuery, raw))}`, (d) =>
      GrnPage.parse(d),
    ),
  );
}

export function getGrn(id: string) {
  return load(api.request(`/inventory/grns/${id}`, (d) => GrnDto.parse(d)));
}

export function listPutaway() {
  return load(api.request('/inventory/putaway', (d) => PutawayList.parse(d)));
}

export function listDiscrepancies(raw: Query) {
  return load(
    api.request(
      `/inventory/discrepancies${toQuery(readQuery(DiscrepancyQuery, raw))}`,
      (d) => DiscrepancyPage.parse(d),
    ),
  );
}

export function getDiscrepancy(id: string) {
  return load(
    api.request(`/inventory/discrepancies/${id}`, (d) =>
      DiscrepancyDto.parse(d),
    ),
  );
}

export function listPhotos(discrepancyId: string) {
  return unlessForbidden(
    api.request(
      `/attachments${toQuery({ entityKey: DISCREPANCY_ENTITY, entityId: discrepancyId })}`,
      (d) => z.array(Attachment).parse(d),
    ),
    [],
  );
}

export function listMovements(itemId: string, page = 1) {
  return api.request(
    `/inventory/items/${itemId}/movements${toQuery({ page, limit: MOVEMENTS_PER_PAGE })}`,
    (d) => MovementPage.parse(d),
  );
}
