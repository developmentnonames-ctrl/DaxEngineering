'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { AdminUser, CreateUserInput } from '@dax/platform-contract';
import { ApiError } from '@dax/web-data-access/server';
import { api } from '../../../lib/server';

export interface CreateUserState {
  error?: string;
  fields?: string[];
}

export async function createUser(
  _prev: CreateUserState,
  form: FormData,
): Promise<CreateUserState> {
  const parsed = CreateUserInput.safeParse({
    name: form.get('name'),
    username: form.get('username'),
    email: form.get('email'),
    isSuperAdmin: form.get('isSuperAdmin') === 'on',
  });
  if (!parsed.success) {
    return {
      error: 'Check the highlighted fields.',
      fields: parsed.error.issues.map((i) => String(i.path[0])),
    };
  }
  try {
    await api.request('/admin/users', (d) => AdminUser.parse(d), {
      method: 'POST',
      json: parsed.data,
    });
  } catch (error) {
    if (error instanceof ApiError && error.status < 500) {
      return {
        error: error.body.message ?? 'Could not create the user.',
        fields: error.body.fields,
      };
    }
    throw error;
  }
  redirect('/users?created=1');
}

const Id = z.uuid();
const ACTIONS = ['unlock', 'deactivate', 'activate', 'password-link'] as const;
export type UserAction = (typeof ACTIONS)[number];

export async function userAction(
  action: UserAction,
  id: string,
): Promise<void> {
  if (!ACTIONS.includes(action) || !Id.safeParse(id).success) return;
  await api.request(`/admin/users/${id}/${action}`, () => undefined, {
    method: 'POST',
  });
  revalidatePath('/users');
}
