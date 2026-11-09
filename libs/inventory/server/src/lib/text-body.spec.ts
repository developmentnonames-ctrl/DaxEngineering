import type { IncomingMessage } from 'node:http';
import { Readable } from 'node:stream';
import {
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { CSV_TYPES, readTextBody } from './text-body';

function request(
  body: string,
  type = 'text/csv; charset=utf-8',
): IncomingMessage {
  const stream = Readable.from([
    Buffer.from(body),
  ]) as unknown as IncomingMessage;
  stream.headers = { 'content-type': type };
  return stream;
}

describe('readTextBody', () => {
  it('reads a CSV body', async () => {
    expect(
      await readTextBody(request('a,b\n1,2'), { limit: 100, types: CSV_TYPES }),
    ).toBe('a,b\n1,2');
  });

  it('rejects other content types', async () => {
    await expect(
      readTextBody(request('{}', 'application/json'), {
        limit: 100,
        types: CSV_TYPES,
      }),
    ).rejects.toBeInstanceOf(UnsupportedMediaTypeException);
  });

  it('rejects bodies over the limit', async () => {
    await expect(
      readTextBody(request('x'.repeat(101)), { limit: 100, types: CSV_TYPES }),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);
  });
});
