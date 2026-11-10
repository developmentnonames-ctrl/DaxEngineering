import {
  WARRANTY_NOTE_REQUIRED,
  type WarrantyOutcome,
  type WarrantyStatus,
} from '@dax/inventory-contract';
import { conflict, invalid } from '../common';

export function assertOpen(status: WarrantyStatus): void {
  if (status === 'CLOSED') {
    conflict('INVALID_STATE', 'This warranty tag is already closed.');
  }
}

export function assertCanSend(status: WarrantyStatus): void {
  assertOpen(status);
  if (status === 'SENT') {
    conflict('INVALID_STATE', 'This part has already been sent to a supplier.');
  }
}

export function closeNoteFor(
  outcome: WarrantyOutcome,
  note: string | null | undefined,
): string | null {
  const text = note?.trim() || null;
  if (!text && WARRANTY_NOTE_REQUIRED.includes(outcome)) {
    invalid('Say why in the closing note.', ['note']);
  }
  return text;
}

export function assertSupplierKept(
  status: WarrantyStatus,
  supplierId: string | null | undefined,
): void {
  if (status === 'SENT' && supplierId === null) {
    invalid('A part sent to a supplier must keep its supplier.', [
      'supplierId',
    ]);
  }
}
