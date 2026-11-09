'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { ModuleToggleInput, ModuleToggleResult } from '@dax/platform-contract';
import { failure, invalid } from '../../../lib/action-errors';
import type { ActionState } from '../../../lib/action-state';
import { api } from '../../../lib/server';

const Payload = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]*$/),
  input: ModuleToggleInput,
});

export async function toggleModule(
  _prev: ActionState,
  payload: z.input<typeof Payload>,
): Promise<ActionState> {
  const parsed = Payload.safeParse(payload);
  if (!parsed.success) return invalid(parsed.error);
  const { key, input } = parsed.data;
  let result: z.infer<typeof ModuleToggleResult>;
  try {
    result = await api.request(
      `/admin/modules/${key}`,
      (d) => ModuleToggleResult.parse(d),
      { method: 'PUT', json: input },
    );
  } catch (error) {
    return failure(error, 'Could not change the module.');
  }
  revalidatePath('/', 'layout');
  const state = result.enabled ? 'on' : 'off';
  return {
    ok: true,
    message: result.restartRequired
      ? `Turned ${state}. Restart the system for this to take full effect.`
      : `Turned ${state}.`,
  };
}
