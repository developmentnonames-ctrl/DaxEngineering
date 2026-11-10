import type { MovementRow } from '@dax/inventory-contract';

export interface PartRef {
  id: string;
  partNo: string;
  brand: string;
  description: string;
  uom: string;
  free?: string;
}

export interface BinRef {
  id: string;
  code: string;
}

export type PartLookup =
  | { type: 'part'; part: PartRef }
  | { type: 'choices'; parts: Omit<PartRef, 'uom'>[] }
  | { type: 'none' }
  | { type: 'error'; message: string };

export type BinLookup =
  | { type: 'bin'; bin: BinRef }
  | { type: 'none' }
  | { type: 'error'; message: string };

/** Movements per "Load more" step on an item's page. */
export const MOVEMENTS_PER_PAGE = 20;

export interface MovementsResult {
  rows: MovementRow[];
  /** Movements across all pages, so the list knows when to stop. */
  total: number;
  error?: string;
}
