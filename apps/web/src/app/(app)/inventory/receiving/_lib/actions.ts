'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  BinDetail,
  DiscrepancyClose,
  DiscrepancyNotes,
  GrnCreate,
  GrnDto,
  GrnReverseInput,
  GrnTransition,
  GrnUpdate,
  ItemDetail,
  ItemPage,
  MovementPage,
  PutawayInput,
  ScanResult,
} from '@dax/inventory-contract';
import { SupplierPage } from '@dax/parties-contract';
import { ApiError } from '@dax/web-data-access/server';
import { failure, invalid } from '../../../../../lib/action-errors';
import type { ActionState } from '../../../../../lib/action-state';
import { nullable, text } from '../../../../../lib/form-data';
import { isUuid } from '../../../../../lib/load';
import { toQuery } from '../../../../../lib/query';
import { ScanCode, scanLookupPath } from '../../../../../lib/scan-code';
import { api } from '../../../../../lib/server';
import type { PickerOption } from '../../_lib/search-actions';
import { BASE, grnPath } from './labels';
import type { BinLookup, MovementsResult, PartLookup, PartRef } from './types';

const CODES: Record<string, string> = {
  STALE: 'Someone else changed this. Reload.',
  INVALID_STATE:
    'This has moved on since you opened it. Reload to see where it is now.',
  INSUFFICIENT_STOCK:
    'There is not enough stock in the receiving bin for that. Reload and check the quantities.',
  GRN_STOCK_USED:
    'Some of this stock has already been put away or used, so the GRN can no longer be reversed.',
  NUMBER_SERIES_UNAVAILABLE:
    'No GRN number series is open for this year. Ask an administrator to set it up, then post again.',
};

const Search = z.string().trim().max(100);

async function quietly<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof ApiError) return fallback;
    throw error;
  }
}

function refresh() {
  revalidatePath('/inventory', 'layout');
}

export async function searchSuppliers(q: string): Promise<PickerOption[]> {
  const query = Search.safeParse(q);
  if (!query.success) return [];
  const page = await quietly(
    api.request(
      `/parties/suppliers${toQuery({ q: query.data || undefined, active: 'true', limit: 20 })}`,
      (d) => SupplierPage.parse(d),
    ),
    { items: [], nextCursor: null },
  );
  return page.items.map((s) => ({
    value: s.id,
    label: `${s.name} · ${s.isForeign ? 'Foreign' : 'Local'}`,
  }));
}

function partOf(item: ItemDetail): PartRef {
  return {
    id: item.id,
    partNo: item.partNo,
    brand: item.brand.name,
    description: item.description,
    uom: item.uom,
  };
}

export async function findParts(q: string): Promise<PartRef[]> {
  const query = Search.safeParse(q);
  if (!query.success || query.data.length < 2) return [];
  const page = await quietly(
    api.request(
      `/inventory/items${toQuery({ q: query.data, limit: 20, status: 'ACTIVE' })}`,
      (d) => ItemPage.parse(d),
    ),
    { items: [], nextCursor: null },
  );
  return page.items.map((i) => ({
    id: i.id,
    partNo: i.partNo,
    brand: i.brand.name,
    description: i.description,
    uom: i.uom,
  }));
}

export async function getPart(id: string): Promise<PartRef | null> {
  if (!isUuid(id)) return null;
  return quietly(
    api.request(`/inventory/items/${id}`, (d) => partOf(ItemDetail.parse(d))),
    null,
  );
}

async function scan(raw: string): Promise<ScanResult | { type: 'error' }> {
  const code = ScanCode.safeParse(raw);
  if (!code.success) return { type: 'none' };
  try {
    return await api.request(scanLookupPath(code.data), (d) =>
      ScanResult.parse(d),
    );
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    if (error.status === 401) redirect('/login');
    if (error.status === 404) return { type: 'none' };
    return { type: 'error' };
  }
}

export async function lookupPart(code: string): Promise<PartLookup> {
  const result = await scan(code);
  if (result.type === 'error')
    return { type: 'error', message: 'The lookup failed. Try again.' };
  if (result.type === 'bin')
    return {
      type: 'error',
      message: "That's a bin label. Scan the part's barcode or label.",
    };
  if (result.type === 'choices')
    return {
      type: 'choices',
      parts: result.items.map((i) => ({
        id: i.id,
        partNo: i.partNo,
        brand: i.brand,
        description: i.description,
      })),
    };
  if (result.type === 'item') {
    const part = await getPart(result.id);
    return part ? { type: 'part', part } : { type: 'none' };
  }
  return { type: 'none' };
}

export async function lookupBin(code: string): Promise<BinLookup> {
  const result = await scan(code);
  if (result.type === 'error')
    return { type: 'error', message: 'The lookup failed. Try again.' };
  if (result.type === 'item' || result.type === 'choices')
    return {
      type: 'error',
      message: "That's a part, not a bin. Scan the bin label on the shelf.",
    };
  if (result.type !== 'bin') return { type: 'none' };
  const bin = await quietly(
    api.request(`/inventory/bins/${result.id}`, (d) => BinDetail.parse(d)),
    null,
  );
  if (!bin) return { type: 'none' };
  if (!bin.active)
    return { type: 'error', message: `Bin ${bin.code} is switched off.` };
  return { type: 'bin', bin: { id: bin.id, code: bin.code } };
}

async function createGrn(body: GrnCreate): Promise<ActionState | GrnDto> {
  try {
    return await api.request('/inventory/grns', (d) => GrnDto.parse(d), {
      method: 'POST',
      json: body,
    });
  } catch (error) {
    return failure(error, 'Could not start the GRN.', CODES);
  }
}

export async function startWalkIn(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = GrnCreate.safeParse({
    supplierId: text(form, 'supplierId'),
    deliveryNote: nullable(text(form, 'deliveryNote')),
    deliveryDate: nullable(text(form, 'deliveryDate')),
  });
  if (!parsed.success) return invalid(parsed.error);
  const result = await createGrn(parsed.data);
  if ('ok' in result) return result;
  refresh();
  redirect(grnPath(result.id));
}

const GrnStep = z.enum(['save', 'check', 'post', 'cancel']);
const GrnCommand = z.object({
  id: z.uuid(),
  version: z.int(),
  step: GrnStep,
  update: z.unknown().optional(),
});

const STEP_DONE: Record<z.infer<typeof GrnStep>, string> = {
  save: 'Saved.',
  check: 'Marked as checked. It can be posted now.',
  post: 'Posted. Good stock is in the receiving bin, ready to put away.',
  cancel: 'Draft cancelled.',
};

async function patchGrn(id: string, update: GrnUpdate): Promise<number> {
  const saved = await api.request(
    `/inventory/grns/${id}`,
    (d) => GrnDto.safeParse(d),
    { method: 'PATCH', json: update },
  );
  if (saved.success) return saved.data.version;
  const fresh = await api.request(`/inventory/grns/${id}`, (d) =>
    GrnDto.parse(d),
  );
  return fresh.version;
}

export async function runGrnStep(
  _prev: ActionState,
  payload: z.input<typeof GrnCommand>,
): Promise<ActionState> {
  const parsed = GrnCommand.safeParse(payload);
  if (!parsed.success) return { ok: false, error: 'Unknown GRN.' };
  const { id, step } = parsed.data;
  let version = parsed.data.version;
  let update: GrnUpdate | undefined;
  if (parsed.data.update !== undefined) {
    const body = GrnUpdate.safeParse(
      Object.assign({}, parsed.data.update, { version }),
    );
    if (!body.success) return invalid(body.error);
    update = body.data;
  }
  try {
    if (update) version = await patchGrn(id, update);
    if (step !== 'save') {
      await api.request(`/inventory/grns/${id}/${step}`, () => undefined, {
        method: 'POST',
        json: GrnTransition.parse({ version }),
      });
    }
  } catch (error) {
    refresh();
    return failure(
      error,
      step === 'post' ? 'Could not post the GRN.' : 'Could not save the GRN.',
      CODES,
    );
  }
  refresh();
  return { ok: true, message: STEP_DONE[step] };
}

const ReversePayload = GrnReverseInput.extend({ id: z.uuid() });

export async function reverseGrn(
  _prev: ActionState,
  payload: z.input<typeof ReversePayload>,
): Promise<ActionState> {
  const parsed = ReversePayload.safeParse(payload);
  if (!parsed.success) return invalid(parsed.error);
  const { id, ...body } = parsed.data;
  try {
    await api.request(`/inventory/grns/${id}/reverse`, () => undefined, {
      method: 'POST',
      json: body,
    });
  } catch (error) {
    return failure(error, 'Could not reverse the GRN.', CODES);
  }
  refresh();
  return { ok: true, message: 'Reversed. The stock has been taken back out.' };
}

export async function putAway(
  _prev: ActionState,
  payload: z.input<typeof PutawayInput>,
): Promise<ActionState> {
  const parsed = PutawayInput.safeParse(payload);
  if (!parsed.success) return invalid(parsed.error);
  try {
    await api.request('/inventory/putaway', () => undefined, {
      method: 'POST',
      json: parsed.data,
    });
  } catch (error) {
    return failure(error, 'Could not put the stock away.', CODES);
  }
  refresh();
  const count = parsed.data.moves.length;
  return {
    ok: true,
    message:
      count === 1 ? 'Put away. The stock is free now.' : `${count} moves done.`,
  };
}

export async function saveDiscrepancyNotes(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const id = text(form, 'id');
  if (!isUuid(id)) return { ok: false, error: 'Unknown discrepancy.' };
  const parsed = DiscrepancyNotes.safeParse({
    version: Number(text(form, 'version')),
    notes: nullable(text(form, 'notes')),
  });
  if (!parsed.success) return invalid(parsed.error);
  try {
    await api.request(`/inventory/discrepancies/${id}`, () => undefined, {
      method: 'PATCH',
      json: parsed.data,
    });
  } catch (error) {
    return failure(error, 'Could not save the notes.', CODES);
  }
  refresh();
  return { ok: true, message: 'Notes saved.' };
}

export async function closeDiscrepancy(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const id = text(form, 'id');
  if (!isUuid(id)) return { ok: false, error: 'Unknown discrepancy.' };
  const parsed = DiscrepancyClose.safeParse({
    version: Number(text(form, 'version')),
    note: text(form, 'note'),
  });
  if (!parsed.success) return invalid(parsed.error);
  try {
    await api.request(`/inventory/discrepancies/${id}/close`, () => undefined, {
      method: 'POST',
      json: parsed.data,
    });
  } catch (error) {
    return failure(error, 'Could not close the discrepancy.', CODES);
  }
  refresh();
  return { ok: true, message: 'Closed.' };
}

export async function refreshDiscrepancy(id: string): Promise<void> {
  if (isUuid(id)) revalidatePath(`${BASE}/discrepancies/${id}`);
}

export async function loadMovements(
  itemId: string,
  cursor: string,
): Promise<MovementsResult> {
  if (!isUuid(itemId) || !z.string().max(200).safeParse(cursor).success)
    return { rows: [], nextCursor: null, error: 'Could not load more.' };
  try {
    const page = await api.request(
      `/inventory/items/${itemId}/movements${toQuery({ cursor, limit: 20 })}`,
      (d) => MovementPage.parse(d),
    );
    return { rows: page.items, nextCursor: page.nextCursor };
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    return { rows: [], nextCursor: cursor, error: 'Could not load more.' };
  }
}
