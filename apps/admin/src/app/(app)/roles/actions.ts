'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { RoleDetail, RoleGrantsInput, RoleInput } from '@dax/platform-contract';
import { ApiError } from '@dax/web-data-access/server';
import type { ActionState } from '../../../lib/action-state';
import { failure, invalid } from '../../../lib/action-errors';
import { api } from '../../../lib/server';

export interface GrantsState extends ActionState {
  stale?: boolean;
}

const Id = z.uuid();
const STALE_MESSAGE =
  'Someone else changed this role. Reload to see their changes.';
const BAD_ROLE: ActionState = { ok: false, error: 'Role not found.' };

function readRoleForm(form: FormData) {
  const description = String(form.get('description') ?? '').trim();
  return RoleInput.safeParse({
    name: form.get('name'),
    description: description || null,
    require2fa: form.get('require2fa') === 'on',
  });
}

export async function createRole(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = readRoleForm(form);
  if (!parsed.success) return invalid(parsed.error);
  let id: string;
  try {
    const role = await api.request('/admin/roles', (d) => RoleDetail.parse(d), {
      method: 'POST',
      json: parsed.data,
    });
    id = role.id;
  } catch (error) {
    return failure(error, 'Could not add the role.');
  }
  revalidatePath('/roles');
  redirect(`/roles/${id}`);
}

export async function updateRole(
  roleId: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  if (!Id.safeParse(roleId).success) return BAD_ROLE;
  const parsed = readRoleForm(form);
  if (!parsed.success) return invalid(parsed.error);
  try {
    await api.request(`/admin/roles/${roleId}`, (d) => RoleDetail.parse(d), {
      method: 'PATCH',
      json: parsed.data,
    });
  } catch (error) {
    return failure(error, 'Could not save the role.');
  }
  revalidatePath('/roles');
  revalidatePath(`/roles/${roleId}`);
  return { ok: true, message: 'Role saved.' };
}

export async function saveGrants(
  roleId: string,
  _prev: GrantsState,
  payload: unknown,
): Promise<GrantsState> {
  if (!Id.safeParse(roleId).success) return BAD_ROLE;
  const parsed = RoleGrantsInput.safeParse(payload);
  if (!parsed.success) return invalid(parsed.error);
  try {
    await api.request(
      `/admin/roles/${roleId}/grants`,
      (d) => RoleDetail.parse(d),
      { method: 'PUT', json: parsed.data },
    );
  } catch (error) {
    if (
      error instanceof ApiError &&
      error.status === 409 &&
      error.body.code === 'STALE'
    ) {
      return { ok: false, error: STALE_MESSAGE, stale: true };
    }
    return failure(error, 'Could not save access.');
  }
  revalidatePath(`/roles/${roleId}`);
  return { ok: true, message: 'Access saved.' };
}

export async function copyRole(
  roleId: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  if (!Id.safeParse(roleId).success) return BAD_ROLE;
  const parsed = z
    .object({ name: z.string().trim().min(1).max(60) })
    .safeParse({ name: form.get('name') });
  if (!parsed.success) return invalid(parsed.error);
  let id: string;
  try {
    const role = await api.request(
      `/admin/roles/${roleId}/copy`,
      (d) => RoleDetail.parse(d),
      { method: 'POST', json: parsed.data },
    );
    id = role.id;
  } catch (error) {
    return failure(error, 'Could not copy the role.');
  }
  revalidatePath('/roles');
  redirect(`/roles/${id}`);
}

export async function setRoleArchived(
  roleId: string,
  archived: boolean,
): Promise<ActionState> {
  if (!Id.safeParse(roleId).success) return BAD_ROLE;
  try {
    await api.request(
      `/admin/roles/${roleId}/${archived ? 'archive' : 'restore'}`,
      () => undefined,
      { method: 'POST' },
    );
  } catch (error) {
    return failure(
      error,
      archived ? 'Could not archive the role.' : 'Could not restore the role.',
    );
  }
  revalidatePath('/roles');
  revalidatePath(`/roles/${roleId}`);
  return { ok: true, message: archived ? 'Role archived.' : 'Role restored.' };
}
