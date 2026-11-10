import type { HttpException } from '@nestjs/common';
import {
  assertCanSend,
  assertOpen,
  assertSupplierKept,
  closeNoteFor,
} from './rules';

function codeOf(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error) {
    return ((error as HttpException).getResponse() as { code?: string }).code;
  }
  return undefined;
}

describe('warranty rules', () => {
  it('keeps closed tags closed', () => {
    expect(codeOf(() => assertOpen('TAGGED'))).toBeUndefined();
    expect(codeOf(() => assertOpen('SENT'))).toBeUndefined();
    expect(codeOf(() => assertOpen('CLOSED'))).toBe('INVALID_STATE');
  });

  it('sends only tagged parts', () => {
    expect(codeOf(() => assertCanSend('TAGGED'))).toBeUndefined();
    expect(codeOf(() => assertCanSend('SENT'))).toBe('INVALID_STATE');
    expect(codeOf(() => assertCanSend('CLOSED'))).toBe('INVALID_STATE');
  });

  it('needs a note for rejected and scrapped outcomes', () => {
    expect(codeOf(() => closeNoteFor('REJECTED', '  '))).toBe('INVALID_INPUT');
    expect(codeOf(() => closeNoteFor('SCRAPPED', null))).toBe('INVALID_INPUT');
    expect(closeNoteFor('REPLACED', undefined)).toBeNull();
    expect(closeNoteFor('SCRAPPED', ' Burnt ')).toBe('Burnt');
  });

  it('keeps the supplier on a sent part', () => {
    expect(codeOf(() => assertSupplierKept('SENT', null))).toBe(
      'INVALID_INPUT',
    );
    expect(codeOf(() => assertSupplierKept('SENT', undefined))).toBeUndefined();
    expect(codeOf(() => assertSupplierKept('TAGGED', null))).toBeUndefined();
  });
});
