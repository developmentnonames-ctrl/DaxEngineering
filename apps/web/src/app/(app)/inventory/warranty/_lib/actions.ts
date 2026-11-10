'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  WarrantyClose,
  WarrantyDto,
  WarrantySend,
  WarrantyTagInput,
  WarrantyTagUpdate,
} from '@dax/inventory-contract';
import { failure, invalid } from '../../../../../lib/action-errors';
import type { ActionState } from '../../../../../lib/action-state';
import { isUuid } from '../../../../../lib/load';
import { api } from '../../../../../lib/server';
import { BASE, tagPath } from './labels';

const CODES: Record<string, string> = {
  STALE: 'Someone else changed this tag. Reload and try again.',
  INVALID_STATE:
    'This tag has moved on since you opened it. Reload to see where it is now.',
  NUMBER_SERIES_UNAVAILABLE:
    'No warranty tag number series is open for this year. Ask an administrator to set it up, then try again.',
};

function refresh() {
  revalidatePath('/inventory', 'layout');
}

const TagSave = z.object({ id: z.uuid().optional(), body: z.unknown() });

export async function saveTag(
  _prev: ActionState,
  payload: z.input<typeof TagSave>,
): Promise<ActionState> {
  const raw = TagSave.safeParse(payload);
  if (!raw.success) return { ok: false, error: 'Nothing to save.' };
  const { id, body } = raw.data;
  let target: string;
  try {
    if (id) {
      const parsed = WarrantyTagUpdate.safeParse(body);
      if (!parsed.success) return invalid(parsed.error);
      await api.request(`/inventory/warranty/${id}`, () => null, {
        method: 'PATCH',
        json: parsed.data,
      });
      target = id;
    } else {
      const parsed = WarrantyTagInput.safeParse(body);
      if (!parsed.success) return invalid(parsed.error);
      ({ id: target } = await api.request(
        '/inventory/warranty',
        (d) => WarrantyDto.parse(d),
        { method: 'POST', json: parsed.data },
      ));
    }
  } catch (error) {
    return failure(
      error,
      id ? 'Could not save the tag.' : 'Could not tag the part.',
      CODES,
    );
  }
  refresh();
  redirect(tagPath(target));
}

const SendPayload = WarrantySend.extend({ id: z.uuid() });

export async function sendTag(
  _prev: ActionState,
  payload: z.input<typeof SendPayload>,
): Promise<ActionState> {
  const parsed = SendPayload.safeParse(payload);
  if (!parsed.success) return invalid(parsed.error);
  const { id, ...body } = parsed.data;
  try {
    await api.request(`/inventory/warranty/${id}/send`, () => null, {
      method: 'POST',
      json: body,
    });
  } catch (error) {
    return failure(error, 'Could not mark the part as sent.', CODES);
  }
  refresh();
  return { ok: true, message: 'Marked as sent to the supplier.' };
}

const ClosePayload = z.object({ id: z.uuid(), body: z.unknown() });

export async function closeTag(
  _prev: ActionState,
  payload: z.input<typeof ClosePayload>,
): Promise<ActionState> {
  const raw = ClosePayload.safeParse(payload);
  if (!raw.success) return { ok: false, error: 'Unknown tag.' };
  const parsed = WarrantyClose.safeParse(raw.data.body);
  if (!parsed.success) return invalid(parsed.error);
  try {
    await api.request(`/inventory/warranty/${raw.data.id}/close`, () => null, {
      method: 'POST',
      json: parsed.data,
    });
  } catch (error) {
    return failure(error, 'Could not close the tag.', CODES);
  }
  refresh();
  return { ok: true, message: 'Closed.' };
}

const RemovePhoto = z.object({ id: z.uuid(), photoId: z.uuid() });

export async function removePhoto(
  _prev: ActionState,
  payload: z.input<typeof RemovePhoto>,
): Promise<ActionState> {
  const parsed = RemovePhoto.safeParse(payload);
  if (!parsed.success) return { ok: false, error: 'Unknown photo.' };
  try {
    await api.request(`/attachments/${parsed.data.photoId}`, () => null, {
      method: 'DELETE',
    });
  } catch (error) {
    return failure(error, 'Could not remove the photo.', CODES);
  }
  revalidatePath(tagPath(parsed.data.id));
  return { ok: true, message: 'Photo removed.' };
}

export async function refreshTag(id: string): Promise<void> {
  if (isUuid(id)) revalidatePath(`${BASE}/${id}`);
}
