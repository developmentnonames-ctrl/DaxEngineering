import 'server-only';
import {
  CountDto,
  CountPage,
  CountQuery,
  CountScope,
} from '@dax/inventory-contract';
import { load } from '../../../../../lib/load';
import { type Query, readQuery, toQuery } from '../../../../../lib/query';
import { api } from '../../../../../lib/server';

export function listCounts(raw: Query) {
  return load(
    api.request(
      `/inventory/counts${toQuery(readQuery(CountQuery, raw))}`,
      (d) => CountPage.parse(d),
    ),
  );
}

export function getCount(id: string) {
  return load(api.request(`/inventory/counts/${id}`, (d) => CountDto.parse(d)));
}

export function getCountScope() {
  return load(
    api.request('/inventory/counts/scope', (d) => CountScope.parse(d)),
  );
}
