import 'server-only';
import { redirect } from 'next/navigation';
import { createApi } from '@dax/web-data-access/server';

export const APP = 'web' as const;
export const PRODUCT = 'DAX Stores';
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
