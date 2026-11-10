import 'server-only';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createApi } from '@dax/web-data-access/server';
import { canDo } from '@dax/web-shell';

export const APP = 'web' as const;
export const PRODUCT = 'DAX Engineering - Stores';
export const THEME_COLOR = '#162568';
export const api = createApi(APP);

export function safePath(value: string | null | undefined): string | null {
  return value && value.startsWith('/') && !value.startsWith('//')
    ? value
    : null;
}

export async function loginPath(): Promise<string> {
  const current = safePath((await headers()).get('x-dax-path'));
  return current && current !== '/'
    ? `/login?next=${encodeURIComponent(current)}`
    : '/login';
}

export async function requireUser() {
  const me = await api.getMe();
  if (!me) redirect(await loginPath());
  return me;
}

export async function requireReadyUser() {
  const me = await requireUser();
  if (me.pending) redirect('/account/setup');
  return me;
}

export async function requireCapabilities() {
  const caps = await api.getCapabilities();
  if (!caps) redirect(await loginPath());
  if (caps.pending) redirect('/account/setup');
  return caps;
}

export async function requirePermission(...anyOf: string[]) {
  const caps = await requireCapabilities();
  if (!anyOf.some((p) => canDo(caps, p))) redirect('/');
  return caps;
}
