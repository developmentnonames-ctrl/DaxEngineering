import 'server-only';
import { redirect } from 'next/navigation';
import { createApi } from '@dax/web-data-access/server';
import { canDo } from '@dax/web-shell';

export const APP = 'admin' as const;
export const PRODUCT = 'DAX Admin';
export const api = createApi(APP);

export async function requireUser() {
  const me = await api.getMe();
  if (!me) redirect('/login');
  return me;
}

export async function requireReadyUser() {
  const me = await requireUser();
  if (me.pending) redirect('/account/setup');
  return me;
}

export async function requireCapabilities() {
  const caps = await api.getCapabilities();
  if (!caps) redirect('/login');
  if (caps.pending) redirect('/account/setup');
  return caps;
}

export async function requirePermission(permission: string) {
  const caps = await requireCapabilities();
  if (!canDo(caps, permission)) redirect('/');
  return caps;
}
