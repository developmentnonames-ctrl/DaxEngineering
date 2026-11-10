'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  BinPage,
  ItemDetail,
  ReturnDto,
  ReturnInput,
  ReturnUpdate,
} from '@dax/inventory-contract';
import { ApiError } from '@dax/web-data-access/server';
import { failure, invalid } from '../../../../../lib/action-errors';
import type { ActionState } from '../../../../../lib/action-state';
import { isUuid } from '../../../../../lib/load';
import { toQuery } from '../../../../../lib/query';
import { api } from '../../../../../lib/server';
import type { PickerOption } from '../../_lib/search-actions';
import { returnPath } from './labels';

const CODES: Record<string, string> = {
  STALE: 'Someone else changed this. Reload.',
  INVALID_STATE:
    'This has moved on since you opened it. Reload to see where it is now.',
  NUMBER_SERIES_UNAVAILABLE:
    'No number series is open for this year. Ask an administrator to set it up, then try again.',
};

function refresh() {
  revalidatePath('/inventory', 'layout');
  revalidatePath('/');
}

async function quietly<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof ApiError) return fallback;
    throw error;
  }
}

const Search = z.string().trim().max(100);

export async function searchStorageBins(q: string): Promise<PickerOption[]> {
  const query = Search.safeParse(q);
  if (!query.success) return [];
  const page = await quietly(
    api.request(
      `/inventory/bins${toQuery({ q: query.data || undefined, limit: 20, active: 'true', kind: 'STORAGE' })}`,
      (d) => BinPage.parse(d),
    ),
    { items: [], total: 0, page: 1, limit: 20 },
  );
  return page.items.map((b) => ({ value: b.id, label: b.code }));
}

export async function usualBinOf(
  itemId: string,
): Promise<{ id: string; code: string } | null> {
  if (!isUuid(itemId)) return null;
  return quietly(
    api.request(
      `/inventory/items/${itemId}`,
      (d) => ItemDetail.parse(d).defaultBin,
    ),
    null,
  );
}

const ReturnSave = z.object({
  id: z.uuid().optional(),
  body: z.unknown(),
  post: z.boolean().default(false),
});

export async function saveReturn(
  _prev: ActionState,
  payload: z.input<typeof ReturnSave>,
): Promise<ActionState> {
  const raw = ReturnSave.safeParse(payload);
  if (!raw.success) return { ok: false, error: 'Nothing to save.' };
  const { id, body, post } = raw.data;
  let saved: ReturnDto;
  try {
    if (!id) {
      const parsed = ReturnInput.safeParse(body);
      if (!parsed.success) return invalid(parsed.error);
      saved = await api.request(
        '/inventory/return-notes',
        (d) => ReturnDto.parse(d),
        { method: 'POST', json: parsed.data },
      );
    } else {
      const parsed = ReturnUpdate.safeParse(body);
      if (!parsed.success) return invalid(parsed.error);
      saved = await api.request(
        `/inventory/return-notes/${id}`,
        (d) => ReturnDto.parse(d),
        { method: 'PATCH', json: parsed.data },
      );
    }
  } catch (error) {
    return failure(error, 'Could not save the return.', CODES);
  }
  if (post) {
    try {
      await api.request(
        `/inventory/return-notes/${saved.id}/post`,
        () => null,
        { method: 'POST', json: { version: saved.version } },
      );
    } catch (error) {
      refresh();
      const failed = failure(error, 'Could not post the return.', CODES);
      if (id) return failed;
      return {
        ...failed,
        error: `Saved as a draft, but not posted: ${failed.error ?? ''}`,
        href: returnPath(saved.id),
      };
    }
  }
  refresh();
  redirect(returnPath(saved.id));
}

const ReturnStep = z.object({
  id: z.uuid(),
  version: z.int(),
  step: z.enum(['post', 'cancel']),
});

const DONE = {
  post: 'Posted. Stock is back and any faulty parts are tagged for warranty.',
  cancel: 'Return cancelled.',
} as const;

export async function returnStep(
  _prev: ActionState,
  payload: z.input<typeof ReturnStep>,
): Promise<ActionState> {
  const parsed = ReturnStep.safeParse(payload);
  if (!parsed.success) return { ok: false, error: 'Unknown return.' };
  const { id, version, step } = parsed.data;
  try {
    await api.request(`/inventory/return-notes/${id}/${step}`, () => null, {
      method: 'POST',
      json: { version },
    });
  } catch (error) {
    return failure(
      error,
      step === 'post'
        ? 'Could not post the return.'
        : 'Could not cancel the return.',
      CODES,
    );
  }
  refresh();
  return { ok: true, message: DONE[step] };
}
