'use server';

import { z } from 'zod';
import { BinPage, ItemPage } from '@dax/inventory-contract';
import { ApiError } from '@dax/web-data-access/server';
import { toQuery } from '../../../../lib/query';
import { api } from '../../../../lib/server';

export interface PickerOption {
  value: string;
  label: string;
}

const Search = z.string().trim().max(100);

async function quietly<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof ApiError) return fallback;
    throw error;
  }
}

export async function searchItems(
  q: string,
  excludeId?: string,
): Promise<PickerOption[]> {
  const query = Search.safeParse(q);
  if (!query.success || query.data.length < 2) return [];
  const page = await quietly(
    api.request(
      `/inventory/items${toQuery({ q: query.data, limit: 20, status: 'ACTIVE' })}`,
      (d) => ItemPage.parse(d),
    ),
    { items: [], nextCursor: null },
  );
  return page.items
    .filter((i) => i.id !== excludeId)
    .map((i) => ({
      value: i.id,
      label: `${i.partNo} (${i.brand.name}) · ${i.description}`,
    }));
}

export async function searchBins(q: string): Promise<PickerOption[]> {
  const query = Search.safeParse(q);
  if (!query.success) return [];
  const page = await quietly(
    api.request(
      `/inventory/bins${toQuery({ q: query.data || undefined, limit: 20, active: 'true' })}`,
      (d) => BinPage.parse(d),
    ),
    { items: [], nextCursor: null },
  );
  return page.items.map((b) => ({ value: b.id, label: b.code }));
}
