'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  CountAddLine,
  CountCreate,
  CountDto,
  CountEntry,
  CountReason,
} from '@dax/inventory-contract';
import { failure, invalid } from '../../../../../lib/action-errors';
import type { ActionState } from '../../../../../lib/action-state';
import { api } from '../../../../../lib/server';
import { countPath } from './labels';

const CODES: Record<string, string> = {
  STALE: 'Someone else changed this count. Reload to see the latest.',
  INVALID_STATE:
    'This count has moved on since you opened it. Reload to see where it is now.',
  NUMBER_SERIES_UNAVAILABLE:
    'No number series is open for stock counts this year. Ask an administrator to set it up, then try again.',
};

function refresh() {
  revalidatePath('/inventory', 'layout');
  revalidatePath('/');
}

const versionOf = (d: unknown) => CountDto.parse(d).version;

export async function createCount(
  _prev: ActionState,
  payload: z.input<typeof CountCreate>,
): Promise<ActionState> {
  const parsed = CountCreate.safeParse(payload);
  if (!parsed.success) return invalid(parsed.error);
  let id: string;
  try {
    ({ id } = await api.request('/inventory/counts', (d) => CountDto.parse(d), {
      method: 'POST',
      json: parsed.data,
    }));
  } catch (error) {
    return failure(error, 'Could not start the count.', CODES);
  }
  refresh();
  redirect(countPath(id));
}

const SaveBin = z.object({
  id: z.uuid(),
  version: z.int(),
  lines: z.array(CountEntry.shape.lines.element).max(500),
  found: z
    .array(CountAddLine.omit({ version: true }))
    .max(50)
    .default([]),
});

export async function saveBinCounts(
  _prev: ActionState,
  payload: z.input<typeof SaveBin>,
): Promise<ActionState> {
  const parsed = SaveBin.safeParse(payload);
  if (!parsed.success) return invalid(parsed.error);
  const { id, lines, found } = parsed.data;
  if (lines.length === 0 && found.length === 0)
    return { ok: true, message: 'Nothing changed.' };
  let version = parsed.data.version;
  try {
    if (lines.length > 0) {
      version = await api.request(`/inventory/counts/${id}/counts`, versionOf, {
        method: 'POST',
        json: { version, lines },
      });
    }
    for (const line of found) {
      version = await api.request(`/inventory/counts/${id}/lines`, versionOf, {
        method: 'POST',
        json: { ...line, version },
      });
    }
  } catch (error) {
    refresh();
    return failure(error, 'Could not save the counts.', {
      ...CODES,
      LINE_EXISTS:
        'That part is already on the sheet for this bin. Enter its count there.',
    });
  }
  refresh();
  return { ok: true, message: 'Counts saved.' };
}

const RemoveLine = z.object({
  id: z.uuid(),
  version: z.int(),
  lineId: z.uuid(),
});

export async function removeCountLine(
  _prev: ActionState,
  payload: z.input<typeof RemoveLine>,
): Promise<ActionState> {
  const parsed = RemoveLine.safeParse(payload);
  if (!parsed.success) return { ok: false, error: 'Unknown line.' };
  const { id, version, lineId } = parsed.data;
  try {
    await api.request(
      `/inventory/counts/${id}/lines/${lineId}/remove`,
      () => null,
      { method: 'POST', json: { version } },
    );
  } catch (error) {
    return failure(error, 'Could not remove the part.', CODES);
  }
  refresh();
  return { ok: true, message: 'Removed.' };
}

const Step = z.object({
  id: z.uuid(),
  version: z.int(),
  step: z.enum(['submit', 'approve']),
});

const STEP_DONE = {
  submit: 'Submitted. The Stores Manager reviews the differences next.',
  approve: 'Approved. The differences are posted and the bins are free again.',
} as const;

export async function countStep(
  _prev: ActionState,
  payload: z.input<typeof Step>,
): Promise<ActionState> {
  const parsed = Step.safeParse(payload);
  if (!parsed.success) return { ok: false, error: 'Unknown count.' };
  const { id, version, step } = parsed.data;
  try {
    await api.request(`/inventory/counts/${id}/${step}`, () => null, {
      method: 'POST',
      json: { version },
    });
  } catch (error) {
    return failure(
      error,
      step === 'approve'
        ? 'Could not approve the count.'
        : 'Could not submit the count.',
      CODES,
    );
  }
  refresh();
  return { ok: true, message: STEP_DONE[step] };
}

const ReasonStep = CountReason.extend({
  id: z.uuid(),
  step: z.enum(['send-back', 'cancel']),
});

const REASON_DONE = {
  'send-back': 'Sent back for a recount.',
  cancel: 'Count cancelled. Its bins are free again.',
} as const;

export async function countReasonStep(
  _prev: ActionState,
  payload: z.input<typeof ReasonStep>,
): Promise<ActionState> {
  const parsed = ReasonStep.safeParse(payload);
  if (!parsed.success) return invalid(parsed.error);
  const { id, step, ...body } = parsed.data;
  try {
    await api.request(`/inventory/counts/${id}/${step}`, () => null, {
      method: 'POST',
      json: body,
    });
  } catch (error) {
    return failure(error, 'Could not update the count.', CODES);
  }
  refresh();
  return { ok: true, message: REASON_DONE[step] };
}
