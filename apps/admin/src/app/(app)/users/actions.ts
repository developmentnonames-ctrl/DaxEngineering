'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  AdminUser,
  AdminUserDetail,
  CreateUserInput,
  OverrideDto,
  OverrideInput,
  UpdateUserInput,
  UserAccessInput,
} from '@dax/platform-contract';
import { failure, invalid } from '../../../lib/action-errors';
import type { ActionState } from '../../../lib/action-state';
import { api, requireCapabilities } from '../../../lib/server';
import { dayEndIso } from './dates';

const Id = z.uuid();
const Day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date')
  .nullable();

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
}

function ids(form: FormData, key: string): string[] {
  return text(form, key)
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function optionalDay(form: FormData, key: string): string | null {
  return text(form, key).trim() || null;
}

export async function createUser(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = CreateUserInput.safeParse({
    name: text(form, 'name'),
    username: text(form, 'username'),
    email: text(form, 'email'),
    departmentIds: ids(form, 'departmentIds'),
    roleIds: ids(form, 'roleIds'),
  });
  if (!parsed.success) return invalid(parsed.error);
  let created: AdminUser;
  try {
    created = await api.request('/admin/users', (d) => AdminUser.parse(d), {
      method: 'POST',
      json: parsed.data,
    });
  } catch (error) {
    return failure(error, 'Could not add the user.');
  }
  revalidatePath('/users');
  redirect(`/users/${created.id}?created=1`);
}

export async function updateProfile(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const id = Id.safeParse(text(form, 'userId'));
  if (!id.success) return { ok: false, error: 'Unknown user.' };
  const input: Record<string, string> = {};
  for (const key of ['name', 'username', 'email'] as const) {
    if (!form.has(key)) continue;
    const value = text(form, key).trim();
    if (key === 'username' && value === '') continue;
    input[key] = value;
  }
  const parsed = UpdateUserInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  try {
    await api.request(`/admin/users/${id.data}`, (d) => AdminUser.parse(d), {
      method: 'PATCH',
      json: parsed.data,
    });
  } catch (error) {
    return failure(error, 'Could not save the profile.');
  }
  revalidatePath(`/users/${id.data}`);
  return { ok: true, message: 'Profile saved.' };
}

const AccessPayload = z.object({
  userId: Id,
  roles: z.array(z.object({ roleId: Id, expiresOn: Day })),
  departmentIds: z.array(Id),
});
export type AccessPayload = z.infer<typeof AccessPayload>;

export async function saveAccess(
  _prev: ActionState,
  payload: AccessPayload,
): Promise<ActionState> {
  const parsed = AccessPayload.safeParse(payload);
  if (!parsed.success) return invalid(parsed.error);
  const { userId, roles, departmentIds } = parsed.data;
  const input = UserAccessInput.safeParse({
    roles: roles.map((r) => ({
      roleId: r.roleId,
      expiresAt: r.expiresOn ? dayEndIso(r.expiresOn) : null,
    })),
    departmentIds,
  });
  if (!input.success) return invalid(input.error);
  try {
    await api.request(
      `/admin/users/${userId}/access`,
      (d) => AdminUserDetail.parse(d),
      { method: 'PUT', json: input.data },
    );
  } catch (error) {
    return failure(error, 'Could not save access.');
  }
  revalidatePath(`/users/${userId}`);
  return { ok: true, message: 'Access saved.' };
}

export async function addOverride(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const id = Id.safeParse(text(form, 'userId'));
  if (!id.success) return { ok: false, error: 'Unknown user.' };
  const expiresOn = Day.safeParse(optionalDay(form, 'expiresOn'));
  if (!expiresOn.success) return invalid(expiresOn.error);
  const effect = text(form, 'effect');
  const parsed = OverrideInput.safeParse({
    permissionKey: text(form, 'permissionKey'),
    effect,
    scope: effect === 'DENY' ? null : text(form, 'scope') || null,
    reason: text(form, 'reason'),
    expiresAt: expiresOn.data ? dayEndIso(expiresOn.data) : null,
  });
  if (!parsed.success) return invalid(parsed.error);
  try {
    await api.request(
      `/admin/users/${id.data}/overrides`,
      (d) => OverrideDto.parse(d),
      { method: 'POST', json: parsed.data },
    );
  } catch (error) {
    return failure(error, 'Could not add the override.');
  }
  revalidatePath(`/users/${id.data}`);
  return { ok: true, message: 'Override added.' };
}

export async function removeOverride(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const userId = Id.safeParse(text(form, 'userId'));
  const overrideId = Id.safeParse(text(form, 'overrideId'));
  if (!userId.success || !overrideId.success)
    return { ok: false, error: 'Unknown override.' };
  try {
    await api.request(
      `/admin/users/${userId.data}/overrides/${overrideId.data}`,
      () => undefined,
      { method: 'DELETE' },
    );
  } catch (error) {
    return failure(error, 'Could not remove the override.');
  }
  revalidatePath(`/users/${userId.data}`);
  return { ok: true, message: 'Override removed.' };
}

const ACCOUNT_ACTIONS = {
  unlock: 'Account unlocked.',
  'password-link': 'Link sent.',
  deactivate: 'Account deactivated.',
  activate: 'Account activated.',
} as const;
const AccountAction = z.enum(
  Object.keys(ACCOUNT_ACTIONS) as [keyof typeof ACCOUNT_ACTIONS],
);
export type AccountAction = z.infer<typeof AccountAction>;

export async function accountAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const id = Id.safeParse(text(form, 'userId'));
  const action = AccountAction.safeParse(text(form, 'action'));
  if (!id.success || !action.success)
    return { ok: false, error: 'Unknown action.' };
  if (action.data === 'deactivate') {
    const caps = await requireCapabilities();
    if (caps.user.id === id.data)
      return { ok: false, error: "You can't deactivate your own account." };
  }
  try {
    await api.request(
      `/admin/users/${id.data}/${action.data}`,
      () => undefined,
      { method: 'POST' },
    );
  } catch (error) {
    return failure(error, 'Could not update the account.');
  }
  revalidatePath(`/users/${id.data}`);
  revalidatePath('/users');
  return { ok: true, message: ACCOUNT_ACTIONS[action.data] };
}
