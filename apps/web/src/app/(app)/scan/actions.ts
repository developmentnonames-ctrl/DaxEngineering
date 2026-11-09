'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { ScanResult } from '@dax/inventory-contract';
import { ApiError } from '@dax/web-data-access/server';
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

const Code = z.string().trim().min(1).max(512);
const LABEL_LINK = /\/q\/([ib])\/([A-Za-z0-9_-]{4,128})\/?$/;

function lookupPath(code: string): string {
  const link = LABEL_LINK.exec(code.split(/[?#]/)[0] ?? '');
  return link
    ? `/inventory/qr/${link[1]}/${link[2]}`
    : `/inventory/scan?code=${encodeURIComponent(code)}`;
}

export async function scanCode(raw: string): Promise<ScanOutcome> {
  const code = Code.safeParse(raw);
  if (!code.success) return { type: 'none' };
  let result: ScanResult;
  try {
    result = await api.request(lookupPath(code.data), (d) =>
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
