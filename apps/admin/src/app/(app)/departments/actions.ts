'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { DepartmentDto, DepartmentInput } from '@dax/platform-contract';
import { failure, invalid } from '../../../lib/action-errors';
import type { ActionState } from '../../../lib/action-state';
import { api } from '../../../lib/server';

const DUPLICATE = { DEPARTMENT_EXISTS: 'A department with this name exists.' };

export async function createDepartment(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = DepartmentInput.safeParse({
    name: form.get('name'),
    active: true,
  });
  if (!parsed.success) return invalid(parsed.error);
  try {
    await api.request('/admin/departments', (d) => DepartmentDto.parse(d), {
      method: 'POST',
      json: parsed.data,
    });
  } catch (error) {
    return failure(error, 'Could not add the department.', DUPLICATE);
  }
  revalidatePath('/departments');
  return { ok: true, message: 'Department added.' };
}

const UpdatePayload = z.object({ id: z.uuid(), input: DepartmentInput });

export async function updateDepartment(
  _prev: ActionState,
  payload: z.input<typeof UpdatePayload>,
): Promise<ActionState> {
  const parsed = UpdatePayload.safeParse(payload);
  if (!parsed.success) return invalid(parsed.error);
  const { id, input } = parsed.data;
  try {
    await api.request(
      `/admin/departments/${id}`,
      (d) => DepartmentDto.parse(d),
      {
        method: 'PATCH',
        json: input,
      },
    );
  } catch (error) {
    return failure(error, 'Could not save the department.', DUPLICATE);
  }
  revalidatePath('/departments');
  return { ok: true, message: 'Saved.' };
}
