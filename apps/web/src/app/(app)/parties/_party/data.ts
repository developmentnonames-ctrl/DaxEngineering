import 'server-only';
import { PartiesSummary, PartyQuery } from '@dax/parties-contract';
import { load, optional } from '../../../../lib/load';
import { type Query, readQuery, toQuery } from '../../../../lib/query';
import { api } from '../../../../lib/server';
import {
  PARTIES,
  type PartyDto,
  type PartyKind,
  parseParty,
  SCHEMAS,
} from './config';

export async function listParties(kind: PartyKind, raw: Query) {
  const query = readQuery(PartyQuery, raw);
  const page = await load(
    api.request(`${PARTIES[kind].base}${toQuery(query)}`, (d) =>
      SCHEMAS[kind].page.parse(d),
    ),
  );
  return { ...page, items: page.items as PartyDto[] };
}

export function getParty(kind: PartyKind, id: string): Promise<PartyDto> {
  return load(
    api.request(`${PARTIES[kind].base}/${id}`, (d) => parseParty(kind, d)),
  );
}

export function getPartiesSummary() {
  return optional(
    api.request('/parties/summary', (d) => PartiesSummary.parse(d)),
  );
}
