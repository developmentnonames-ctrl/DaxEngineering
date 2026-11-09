'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  BarcodeInput,
  ItemDetail,
  ItemInput,
  ItemStatusInput,
  ItemUpdate,
  SupersedeInput,
} from '@dax/inventory-contract';
import { failure, invalid } from '../../../../../lib/action-errors';
import type { ActionState } from '../../../../../lib/action-state';
import { list, nullable, text } from '../../../../../lib/form-data';
import { isUuid } from '../../../../../lib/load';
import { api } from '../../../../../lib/server';

const BASE = '/inventory/items';
const STALE =
  'Someone else changed this item. Reload the page to see their changes.';
const CODES = {
  ITEM_EXISTS: 'This brand already has an item with this part number.',
  BARCODE_IN_USE: 'This barcode is already on another item.',
  SUPERSESSION_CYCLE: 'That replacement would loop back to this item.',
};

function readForm(form: FormData) {
  return {
    partNo: text(form, 'partNo'),
    brandId: text(form, 'brandId'),
    description: text(form, 'description'),
    uom: text(form, 'uom'),
    minQty: text(form, 'minQty') || '0',
    defaultBinId: nullable(text(form, 'defaultBinId')),
    machineModelIds: list(form, 'machineModelIds'),
    notes: nullable(text(form, 'notes')),
  };
}

function sameIds(a: string[], b: string[]): boolean {
  return a.length === b.length && [...a].sort().join() === [...b].sort().join();
}

function itemChanges(current: ItemDetail, next: ReturnType<typeof readForm>) {
  const changes: Partial<ReturnType<typeof readForm>> = {};
  if (next.partNo !== current.partNo) changes.partNo = next.partNo;
  if (next.brandId !== current.brand.id) changes.brandId = next.brandId;
  if (next.description !== current.description)
    changes.description = next.description;
  if (next.uom !== current.uom) changes.uom = next.uom;
  if (Number(next.minQty) !== Number(current.minQty))
    changes.minQty = next.minQty;
  if (next.defaultBinId !== (current.defaultBin?.id ?? null))
    changes.defaultBinId = next.defaultBinId;
  if (
    !sameIds(
      next.machineModelIds,
      current.machineModels.map((m) => m.id),
    )
  )
    changes.machineModelIds = next.machineModelIds;
  if (next.notes !== (current.notes ?? null)) changes.notes = next.notes;
  return changes;
}

export async function saveItem(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const id = text(form, 'id');
  const values = readForm(form);

  if (!id) {
    const parsed = ItemInput.safeParse(values);
    if (!parsed.success) return invalid(parsed.error);
    let created: ItemDetail;
    try {
      created = await api.request(BASE, (d) => ItemDetail.parse(d), {
        method: 'POST',
        json: parsed.data,
      });
    } catch (error) {
      return failure(error, 'Could not add the item.', CODES);
    }
    revalidatePath(BASE);
    redirect(`${BASE}/${created.id}`);
  }

  if (!isUuid(id)) return { ok: false, error: 'Unknown item.' };
  try {
    const current = await api.request(`${BASE}/${id}`, (d) =>
      ItemDetail.parse(d),
    );
    if (Number(text(form, 'version')) !== current.version) {
      return { ok: false, error: STALE };
    }
    const changes = itemChanges(current, values);
    if (Object.keys(changes).length === 0) {
      return { ok: true, message: 'No changes to save.' };
    }
    const parsed = ItemUpdate.safeParse({
      ...changes,
      version: current.version,
    });
    if (!parsed.success) return invalid(parsed.error);
    await api.request(`${BASE}/${id}`, (d) => ItemDetail.parse(d), {
      method: 'PATCH',
      json: parsed.data,
    });
  } catch (error) {
    return failure(error, 'Could not save the item.', CODES);
  }
  revalidatePath(BASE);
  revalidatePath(`${BASE}/${id}`);
  return { ok: true, message: 'Saved.' };
}

function done(id: string, message: string): ActionState {
  revalidatePath(BASE);
  revalidatePath(`${BASE}/${id}`);
  return { ok: true, message };
}

const StatusPayload = ItemStatusInput.extend({ id: z.uuid() });

export async function setItemStatus(
  _prev: ActionState,
  payload: z.input<typeof StatusPayload>,
): Promise<ActionState> {
  const parsed = StatusPayload.safeParse(payload);
  if (!parsed.success) return invalid(parsed.error);
  const { id, ...body } = parsed.data;
  try {
    await api.request(`${BASE}/${id}/status`, () => undefined, {
      method: 'POST',
      json: body,
    });
  } catch (error) {
    return failure(error, 'Could not change the item status.', CODES);
  }
  return done(id, body.status === 'ARCHIVED' ? 'Archived.' : 'Restored.');
}

const ReplacementPayload = SupersedeInput.extend({ id: z.uuid() });

export async function setReplacement(
  _prev: ActionState,
  payload: z.input<typeof ReplacementPayload>,
): Promise<ActionState> {
  const parsed = ReplacementPayload.safeParse(payload);
  if (!parsed.success)
    return { ok: false, error: 'Choose the new part first.' };
  const { id, ...body } = parsed.data;
  if (body.replacementId === id) {
    return { ok: false, error: 'An item cannot replace itself.' };
  }
  try {
    await api.request(`${BASE}/${id}/supersession`, () => undefined, {
      method: 'PUT',
      json: body,
    });
  } catch (error) {
    return failure(error, 'Could not save the replacement.', CODES);
  }
  return done(
    id,
    body.replacementId ? 'Replacement saved.' : 'Replacement removed.',
  );
}

export async function addBarcode(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const id = text(form, 'id');
  if (!isUuid(id)) return { ok: false, error: 'Unknown item.' };
  const parsed = BarcodeInput.safeParse({
    code: text(form, 'code'),
    kind: text(form, 'kind'),
  });
  if (!parsed.success) return invalid(parsed.error);
  try {
    await api.request(`${BASE}/${id}/barcodes`, () => undefined, {
      method: 'POST',
      json: parsed.data,
    });
  } catch (error) {
    return failure(error, 'Could not add the barcode.', CODES);
  }
  return done(id, `Barcode ${parsed.data.code} added.`);
}

const RemoveBarcode = z.object({ id: z.uuid(), barcodeId: z.uuid() });

export async function removeBarcode(
  _prev: ActionState,
  payload: z.input<typeof RemoveBarcode>,
): Promise<ActionState> {
  const parsed = RemoveBarcode.safeParse(payload);
  if (!parsed.success) return invalid(parsed.error);
  const { id, barcodeId } = parsed.data;
  try {
    await api.request(`${BASE}/${id}/barcodes/${barcodeId}`, () => undefined, {
      method: 'DELETE',
    });
  } catch (error) {
    return failure(error, 'Could not remove the barcode.', CODES);
  }
  return done(id, 'Barcode removed.');
}
