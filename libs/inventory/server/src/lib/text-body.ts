import type { IncomingMessage } from 'node:http';
import {
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';

export const CSV_TYPES = ['text/csv', 'text/plain', 'application/vnd.ms-excel'];

export function readTextBody(
  req: IncomingMessage & { body?: unknown },
  options: { limit: number; types: readonly string[] },
): Promise<string> {
  if (typeof req.body === 'string') return Promise.resolve(req.body);
  const type = (req.headers['content-type'] ?? '')
    .split(';')[0]
    ?.trim()
    .toLowerCase();
  if (!type || !options.types.includes(type)) {
    return Promise.reject(
      new UnsupportedMediaTypeException({
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: 'Upload a CSV file.',
      }),
    );
  }
  const declared = Number(req.headers['content-length'] ?? 0);
  if (declared > options.limit) return Promise.reject(tooLarge(options.limit));

  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let failed = false;
    req.on('data', (chunk: Buffer) => {
      if (failed) return;
      size += chunk.length;
      if (size > options.limit) {
        failed = true;
        req.resume();
        reject(tooLarge(options.limit));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!failed) resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', (error) => {
      if (!failed) reject(error);
    });
  });
}

function tooLarge(limit: number) {
  return new PayloadTooLargeException({
    code: 'TOO_LARGE',
    message: `The file is larger than ${Math.round(limit / 1024 / 1024)} MB.`,
  });
}
