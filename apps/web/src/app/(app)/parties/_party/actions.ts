'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { PARTY_KINDS } from '@dax/parties-contract';
import { failure, invalid } from '../../../../lib/action-errors';
import type { ActionState } from '../../../../lib/action-state';
import { flag, nullable, text } from '../../../../lib/form-data';
import { isUuid } from '../../../../lib/load';
import { api } from '../../../../lib/server';
import {
  CONTACT_FIELDS,
  PARTIES,
  type PartyDto,
  type PartyKind,
  parseParty,
  SCHEMAS,
} from './config';

const STALE =
  'Someone else changed this. Reload the page to see their changes.';

function readKind(form: FormData): PartyKind | null {
  const parsed = z.enum(PARTY_KINDS).safeParse(form.get('kind'));
  return parsed.success ? parsed.data : null;
}

function createInput(kind: PartyKind, form: FormData) {
  const input: Record<string, unknown> = { name: text(form, 'name') };
  for (const { key } of CONTACT_FIELDS) {
    const value = text(form, key);
    if (value) input[key] = value;
  }
  if (kind === 'supplier') {
    const country = text(form, 'country');
    if (country) input['country'] = country;
    input['isForeign'] = flag(form, 'isForeign');
  }
  return SCHEMAS[kind].input.safeParse(input);
}

function changedFields(
  kind: PartyKind,
  current: PartyDto,
  form: FormData,
): Record<string, unknown> {
  const changes: Record<string, unknown> = {};
  const name = text(form, 'name');
  if (name !== current.name) changes['name'] = name;
  const keys: string[] = CONTACT_FIELDS.map((f) => f.key);
  if (kind === 'supplier') keys.push('country');
  const visible = current as Record<string, unknown>;
  for (const key of keys) {
    if (!(key in visible) || !form.has(key)) continue;
    const value = nullable(text(form, key));
    if (value !== (visible[key] ?? null)) changes[key] = value;
  }
  if (kind === 'supplier' && form.has('isForeignShown')) {
    const isForeign = flag(form, 'isForeign');
    if (isForeign !== current.isForeign) changes['isForeign'] = isForeign;
  }
  return changes;
}

export async function saveParty(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const kind = readKind(form);
  if (!kind) return { ok: false, error: 'Unknown record type.' };
  const { base, noun } = PARTIES[kind];
  const id = text(form, 'id');

  if (!id) {
    const parsed = createInput(kind, form);
    if (!parsed.success) return invalid(parsed.error);
    let created: PartyDto;
    try {
      created = await api.request(base, (d) => parseParty(kind, d), {
        method: 'POST',
        json: parsed.data,
      });
    } catch (error) {
      return failure(error, `Could not add the ${noun}.`);
    }
    revalidatePath(base);
    redirect(`${base}/${created.id}`);
  }

  if (!isUuid(id)) return { ok: false, error: 'Unknown record.' };
  try {
    const current = await api.request(`${base}/${id}`, (d) =>
      parseParty(kind, d),
    );
    if (Number(text(form, 'version')) !== current.version) {
      return { ok: false, error: STALE };
    }
    const changes = changedFields(kind, current, form);
    if (Object.keys(changes).length === 0) {
      return { ok: true, message: 'No changes to save.' };
    }
    const parsed = SCHEMAS[kind].update.safeParse({
      ...changes,
      version: current.version,
    });
    if (!parsed.success) return invalid(parsed.error);
    await api.request(`${base}/${id}`, (d) => parseParty(kind, d), {
      method: 'PATCH',
      json: parsed.data,
    });
  } catch (error) {
    return failure(error, `Could not save the ${noun}.`);
  }
  revalidatePath(base);
  revalidatePath(`${base}/${id}`);
  return { ok: true, message: 'Saved.' };
}

const ArchivePayload = z.object({
  kind: z.enum(PARTY_KINDS),
  id: z.uuid(),
  version: z.int(),
  archive: z.boolean(),
});

export async function setPartyArchived(
  _prev: ActionState,
  payload: z.input<typeof ArchivePayload>,
): Promise<ActionState> {
  const parsed = ArchivePayload.safeParse(payload);
  if (!parsed.success) return invalid(parsed.error);
  const { kind, id, version, archive } = parsed.data;
  const { base, noun } = PARTIES[kind];
  try {
    await api.request(
      `${base}/${id}/${archive ? 'archive' : 'restore'}`,
      () => undefined,
      { method: 'POST', json: { version } },
    );
  } catch (error) {
    return failure(
      error,
      `Could not ${archive ? 'archive' : 'restore'} the ${noun}.`,
    );
  }
  revalidatePath(base);
  revalidatePath(`${base}/${id}`);
  return { ok: true, message: archive ? 'Archived.' : 'Restored.' };
}
