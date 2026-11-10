import 'server-only';
import { z } from 'zod';
import {
  WarrantyCounts,
  WarrantyDto,
  WarrantyPage,
  WarrantyQuery,
} from '@dax/inventory-contract';
import { load, optional, unlessForbidden } from '../../../../../lib/load';
import { type Query, readQuery, toQuery } from '../../../../../lib/query';
import { api } from '../../../../../lib/server';
import { Attachment } from '../../receiving/_lib/data';
import { WARRANTY_ENTITY } from './labels';

export function listWarranty(raw: Query) {
  return load(
    api.request(
      `/inventory/warranty${toQuery(readQuery(WarrantyQuery, raw))}`,
      (d) => WarrantyPage.parse(d),
    ),
  );
}

export function getWarrantyCounts() {
  return optional(
    api.request('/inventory/warranty/summary', (d) => WarrantyCounts.parse(d)),
  );
}

export function getWarranty(id: string) {
  return load(
    api.request(`/inventory/warranty/${id}`, (d) => WarrantyDto.parse(d)),
  );
}

export function listPhotos(tagId: string) {
  return unlessForbidden(
    api.request(
      `/attachments${toQuery({ entityKey: WARRANTY_ENTITY, entityId: tagId })}`,
      (d) => z.array(Attachment).parse(d),
    ),
    [],
  );
}
