'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { ApiError } from '@dax/web-data-access/server';
import { canDo } from '@dax/web-shell';
import { failure } from './action-errors';
import {
  IMPORT_API,
  IMPORT_KINDS,
  type ImportKind,
  ImportResult,
  type ImportState,
  MAX_IMPORT_BYTES,
} from './import';
import { api } from './server';

const PERMISSION: Record<ImportKind, string> = {
  customers: 'parties.customer.import',
  suppliers: 'parties.supplier.import',
  items: 'inventory.item.import',
};

const LIST_PATH: Record<ImportKind, string> = {
  customers: '/parties/customers',
  suppliers: '/parties/suppliers',
  items: '/inventory/items',
};

export async function runImport(
  _prev: ImportState,
  form: FormData,
): Promise<ImportState> {
  const kind = z.enum(IMPORT_KINDS).safeParse(form.get('kind'));
  if (!kind.success) return { ok: false, error: 'Unknown import.' };
  const caps = await api.getCapabilities();
  if (!caps || !canDo(caps, PERMISSION[kind.data])) {
    return { ok: false, error: "You don't have permission to import these." };
  }

  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'Choose a CSV file first.' };
  }
  if (!/\.csv$/i.test(file.name)) {
    return { ok: false, error: 'The file must be a .csv file.' };
  }
  if (file.size > MAX_IMPORT_BYTES) {
    return {
      ok: false,
      error: 'The file is larger than 2 MB. Split it into smaller files.',
    };
  }

  const dryRun = form.get('dryRun') !== 'false';
  const csv = await file.text();
  try {
    const result = await api.request(
      `${IMPORT_API[kind.data]}?dryRun=${String(dryRun)}`,
      (d) => ImportResult.parse(d),
      { method: 'POST', body: csv, contentType: 'text/csv; charset=utf-8' },
    );
    if (!dryRun) revalidatePath(LIST_PATH[kind.data]);
    return { ok: true, result };
  } catch (error) {
    if (error instanceof ApiError) {
      const rejected = ImportResult.safeParse(error.body);
      if (rejected.success) return { ok: true, result: rejected.data };
    }
    return failure(error, 'The file could not be imported. Try again.');
  }
}
