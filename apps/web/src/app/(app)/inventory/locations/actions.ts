'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  BinBulkInput,
  BinBulkResult,
  BinDto,
  BinInput,
  BinUpdate,
  ZoneInput,
} from '@dax/inventory-contract';
import { failure, invalid } from '../../../../lib/action-errors';
import type { ActionState } from '../../../../lib/action-state';
import { flag, list, nullable, text } from '../../../../lib/form-data';
import { isUuid } from '../../../../lib/load';
import { api } from '../../../../lib/server';

const BASE = '/inventory/locations';
const CODES = {
  ZONE_EXISTS: 'A zone with this code already exists.',
  BIN_EXISTS: 'A bin with this code already exists.',
};

export async function createZone(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = ZoneInput.safeParse({
    code: text(form, 'code'),
    name: text(form, 'name'),
  });
  if (!parsed.success) return invalid(parsed.error);
  try {
    await api.request('/inventory/zones', () => undefined, {
      method: 'POST',
      json: parsed.data,
    });
  } catch (error) {
    return failure(error, 'Could not add the zone.', CODES);
  }
  revalidatePath(BASE);
  return { ok: true, message: `Zone ${parsed.data.code} added.` };
}

const ZoneUpdate = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(60).optional(),
  active: z.boolean().optional(),
});

export async function updateZone(
  _prev: ActionState,
  payload: z.input<typeof ZoneUpdate>,
): Promise<ActionState> {
  const parsed = ZoneUpdate.safeParse(payload);
  if (!parsed.success) return invalid(parsed.error);
  const { id, ...body } = parsed.data;
  try {
    await api.request(`/inventory/zones/${id}`, () => undefined, {
      method: 'PATCH',
      json: body,
    });
  } catch (error) {
    return failure(error, 'Could not save the zone.', CODES);
  }
  revalidatePath(BASE);
  return { ok: true, message: 'Saved.' };
}

export async function createBin(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = BinInput.safeParse({
    zoneId: text(form, 'zoneId'),
    rack: text(form, 'rack'),
    shelf: text(form, 'shelf'),
    position: text(form, 'position'),
    kind: text(form, 'kind') || undefined,
    notes: nullable(text(form, 'notes')),
  });
  if (!parsed.success) return invalid(parsed.error);
  let bin: BinDto;
  try {
    bin = await api.request('/inventory/bins', (d) => BinDto.parse(d), {
      method: 'POST',
      json: parsed.data,
    });
  } catch (error) {
    return failure(error, 'Could not add the bin.', CODES);
  }
  revalidatePath(BASE);
  return {
    ok: true,
    message: `Bin ${bin.code} added.`,
    href: `${BASE}/bins/${bin.id}`,
  };
}

function bulkNumber(form: FormData, key: string): number {
  return Number.parseInt(text(form, key), 10);
}

export async function createBins(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = BinBulkInput.safeParse({
    zoneId: text(form, 'zoneId'),
    racks: {
      from: bulkNumber(form, 'rackFrom'),
      to: bulkNumber(form, 'rackTo'),
    },
    shelves: {
      from: bulkNumber(form, 'shelfFrom'),
      to: bulkNumber(form, 'shelfTo'),
    },
    positions: list(form, 'positions'),
    kind: text(form, 'kind') || undefined,
  });
  if (!parsed.success) return invalid(parsed.error);
  let result: z.infer<typeof BinBulkResult>;
  try {
    result = await api.request(
      '/inventory/bins/bulk',
      (d) => BinBulkResult.parse(d),
      { method: 'POST', json: parsed.data },
    );
  } catch (error) {
    return failure(error, 'Could not add the bins.', CODES);
  }
  revalidatePath(BASE);
  const skipped = result.skipped.length
    ? ` Skipped ${result.skipped.length} that already exist: ${result.skipped.slice(0, 10).join(', ')}${result.skipped.length > 10 ? '…' : ''}.`
    : '';
  return {
    ok: true,
    message: `Added ${result.created} ${result.created === 1 ? 'bin' : 'bins'}.${skipped}`,
  };
}

export async function updateBin(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const id = text(form, 'id');
  if (!isUuid(id)) return { ok: false, error: 'Unknown bin.' };
  const parsed = BinUpdate.safeParse({
    kind: text(form, 'kind') || undefined,
    active: flag(form, 'active'),
    notes: nullable(text(form, 'notes')),
    version: Number(text(form, 'version')),
  });
  if (!parsed.success) return invalid(parsed.error);
  try {
    await api.request(`/inventory/bins/${id}`, () => undefined, {
      method: 'PATCH',
      json: parsed.data,
    });
  } catch (error) {
    return failure(error, 'Could not save the bin.', CODES);
  }
  revalidatePath(BASE);
  revalidatePath(`${BASE}/bins/${id}`);
  return { ok: true, message: 'Saved.' };
}
