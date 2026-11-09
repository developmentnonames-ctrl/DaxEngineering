import 'server-only';
import { cache } from 'react';
import {
  AodDto,
  AodPage,
  AodQuery,
  HoldDto,
  HoldPage,
  HoldQuery,
  IssuingSummary,
  MrnDto,
  MrnPage,
  MrnQuery,
} from '@dax/inventory-contract';
import { DepartmentOptions } from '@dax/platform-contract';
import { load, optional, unlessForbidden } from '../../../../../lib/load';
import { type Query, readQuery, toQuery } from '../../../../../lib/query';
import { api } from '../../../../../lib/server';

export const getIssuingSummary = cache(() =>
  optional(
    api.request('/inventory/issuing/summary', (d) => IssuingSummary.parse(d)),
  ),
);

export const getDepartments = cache(async () => {
  const { departments } = await unlessForbidden(
    api.request('/directory/departments', (d) => DepartmentOptions.parse(d)),
    { departments: [] },
  );
  return departments;
});

export function listMrns(raw: Query) {
  return load(
    api.request(`/inventory/mrns${toQuery(readQuery(MrnQuery, raw))}`, (d) =>
      MrnPage.parse(d),
    ),
  );
}

export function getMrn(id: string) {
  return load(api.request(`/inventory/mrns/${id}`, (d) => MrnDto.parse(d)));
}

export function listAods(raw: Query) {
  return load(
    api.request(`/inventory/aods${toQuery(readQuery(AodQuery, raw))}`, (d) =>
      AodPage.parse(d),
    ),
  );
}

export function getAod(id: string) {
  return load(api.request(`/inventory/aods/${id}`, (d) => AodDto.parse(d)));
}

export function listHolds(raw: Query) {
  return load(
    api.request(`/inventory/holds${toQuery(readQuery(HoldQuery, raw))}`, (d) =>
      HoldPage.parse(d),
    ),
  );
}

export function getHold(id: string) {
  return load(api.request(`/inventory/holds/${id}`, (d) => HoldDto.parse(d)));
}

export function findMrn(id: string) {
  return optional(api.request(`/inventory/mrns/${id}`, (d) => MrnDto.parse(d)));
}
