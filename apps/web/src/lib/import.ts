import type { ImportResult } from '@dax/contracts';
import type { ActionState } from './action-state';

export const IMPORT_KINDS = ['customers', 'suppliers', 'items'] as const;
export type ImportKind = (typeof IMPORT_KINDS)[number];

export const IMPORT_API: Record<ImportKind, string> = {
  customers: '/parties/customers/import',
  suppliers: '/parties/suppliers/import',
  items: '/inventory/items/import',
};

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

export { ImportResult } from '@dax/contracts';

export interface ImportState extends ActionState {
  result?: ImportResult;
}
