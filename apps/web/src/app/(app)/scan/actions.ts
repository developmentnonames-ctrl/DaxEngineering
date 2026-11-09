'use server';

import { redirect } from 'next/navigation';
import { ScanResult } from '@dax/inventory-contract';
import { ApiError } from '@dax/web-data-access/server';
import { ScanCode, scanLookupPath } from '../../../lib/scan-code';
import { api, safePath } from '../../../lib/server';

export type ScanOutcome =
  | { type: 'go'; path: string }
  | {
      type: 'choices';
      items: {
        partNo: string;
        brand: string;
        description: string;
        path: string;
      }[];
    }
  | { type: 'none' }
  | { type: 'error'; message: string };

export async function scanCode(raw: string): Promise<ScanOutcome> {
  const code = ScanCode.safeParse(raw);
  if (!code.success) return { type: 'none' };
  let result: ScanResult;
  try {
    result = await api.request(scanLookupPath(code.data), (d) =>
      ScanResult.parse(d),
    );
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    if (error.status === 401) redirect('/login?next=/scan');
    if (error.status === 404) return { type: 'none' };
    if (error.status === 403)
      return {
        type: 'error',
        message: "You don't have access to what this code points to.",
      };
    return { type: 'error', message: 'The lookup failed. Try again.' };
  }

  if (result.type === 'item' || result.type === 'bin') {
    const path = safePath(result.path);
    return path ? { type: 'go', path } : { type: 'none' };
  }
  if (result.type === 'choices') {
    return {
      type: 'choices',
      items: result.items.flatMap((i) => {
        const path = safePath(i.path);
        return path
          ? [
              {
                partNo: i.partNo,
                brand: i.brand,
                description: i.description,
                path,
              },
            ]
          : [];
      }),
    };
  }
  return { type: 'none' };
}
