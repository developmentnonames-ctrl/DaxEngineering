import type { IncomingMessage } from 'node:http';
import { describe, expect, it } from 'vitest';
import { requestIdFor } from './logging';

const req = (id?: string) =>
  ({ headers: id ? { 'x-request-id': id } : {} }) as IncomingMessage;

describe('requestIdFor', () => {
  it('keeps a well-formed incoming id', () => {
    expect(requestIdFor(req('abc12345-req'))).toBe('abc12345-req');
  });

  it('replaces missing or suspicious ids', () => {
    expect(requestIdFor(req())).toMatch(/^[0-9a-f-]{36}$/);
    expect(requestIdFor(req('bad id\nwith newline'))).toMatch(
      /^[0-9a-f-]{36}$/,
    );
    expect(requestIdFor(req('x'.repeat(200)))).toMatch(/^[0-9a-f-]{36}$/);
  });
});
