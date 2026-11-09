'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { NumberSeriesDto, NumberSeriesInput } from '@dax/platform-contract';
import { failure, invalid } from '../../../lib/action-errors';
import type { ActionState } from '../../../lib/action-state';
import { api } from '../../../lib/server';

const Payload = z.object({ id: z.uuid(), input: NumberSeriesInput });

export async function saveSeries(
  _prev: ActionState,
  payload: z.input<typeof Payload>,
): Promise<ActionState> {
  const parsed = Payload.safeParse(payload);
  if (!parsed.success) return invalid(parsed.error);
  const { id, input } = parsed.data;
  try {
    await api.request(
      `/admin/numbering/${id}`,
      (d) => NumberSeriesDto.parse(d),
      { method: 'PATCH', json: input },
    );
  } catch (error) {
    return failure(error, 'Could not save the numbering.');
  }
  revalidatePath('/numbering');
  return { ok: true, message: 'Saved.' };
}
