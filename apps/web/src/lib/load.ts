import 'server-only';
import { notFound, redirect } from 'next/navigation';
import { ApiError } from '@dax/web-data-access/server';
import { loginPath } from './server';

export async function load<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) redirect(await loginPath());
      if (error.status === 404) notFound();
    }
    throw error;
  }
}

export async function unlessForbidden<T>(
  promise: Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await load(promise);
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) return fallback;
    throw error;
  }
}

export async function optional<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) redirect(await loginPath());
      if (error.status === 403 || error.status === 404) return null;
    }
    throw error;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

export async function uuidParam(params: Promise<{ id: string }>) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  return id;
}
