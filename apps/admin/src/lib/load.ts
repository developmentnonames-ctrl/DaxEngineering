import 'server-only';
import { ApiError } from '@dax/web-data-access/server';

export async function unlessForbidden<T>(
  load: Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await load;
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) return fallback;
    throw error;
  }
}
