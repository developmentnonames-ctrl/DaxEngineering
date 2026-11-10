import 'server-only';
import {
  ReturnableAod,
  ReturnAodOptions,
  ReturnDto,
  ReturnPage,
  ReturnQuery,
} from '@dax/inventory-contract';
import { load, optional } from '../../../../../lib/load';
import { type Query, readQuery, toQuery } from '../../../../../lib/query';
import { api } from '../../../../../lib/server';

export function listReturns(raw: Query) {
  return load(
    api.request(
      `/inventory/return-notes${toQuery(readQuery(ReturnQuery, raw))}`,
      (d) => ReturnPage.parse(d),
    ),
  );
}

export function getReturn(id: string) {
  return load(
    api.request(`/inventory/return-notes/${id}`, (d) => ReturnDto.parse(d)),
  );
}

export function findReturnableAod(aodId: string) {
  return optional(
    api.request(`/inventory/return-notes/aod/${aodId}/returnable`, (d) =>
      ReturnableAod.parse(d),
    ),
  );
}

export function listReturnableAods(q: string | undefined) {
  return load(
    api.request(`/inventory/return-notes/aods${toQuery({ q })}`, (d) =>
      ReturnAodOptions.parse(d),
    ),
  );
}
