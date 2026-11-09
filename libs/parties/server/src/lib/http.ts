import type { IncomingMessage } from 'node:http';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  type NestMiddleware,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { PARTY_IMPORT_MAX_BYTES } from '@dax/parties-contract';
import { type DaxRequest, type Policy, sessionOf } from '@dax/platform-core';
import type { z } from 'zod';

export function parse<T extends z.ZodType>(
  schema: T,
  input: unknown,
): z.infer<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new BadRequestException({
      code: 'INVALID_INPUT',
      message: 'Check the highlighted fields.',
      fields: [...new Set(parsed.error.issues.map((i) => i.path.join('.')))],
    });
  }
  return parsed.data;
}

export interface Actor {
  userId: string;
  policy: Policy;
}

export function actorOf(req: DaxRequest): Actor {
  const { user, policy } = sessionOf(req);
  return { userId: user.id, policy };
}

export function importText(body: unknown): string {
  return typeof body === 'string' ? body : '';
}

export function stale(): never {
  throw new ConflictException({
    code: 'STALE',
    message: 'Someone else changed this. Reload and try again.',
  });
}

export function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === 'P2002';
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface Cursor {
  name: string;
  id: string;
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(`${cursor.name}|${cursor.id}`, 'utf8').toString(
    'base64url',
  );
}

export function decodeCursor(value: string): Cursor {
  const text = Buffer.from(value, 'base64url').toString('utf8');
  const split = text.lastIndexOf('|');
  const id = text.slice(split + 1);
  if (split < 0 || !UUID.test(id)) {
    throw new BadRequestException({
      code: 'INVALID_CURSOR',
      message: 'This list position is no longer valid. Reload the list.',
      fields: ['cursor'],
    });
  }
  return { name: text.slice(0, split), id };
}

type CsvRequest = IncomingMessage & { body?: unknown };

export async function readCsvBody(
  req: CsvRequest,
  limit = PARTY_IMPORT_MAX_BYTES,
): Promise<string> {
  const [type, ...params] = (req.headers['content-type'] ?? '')
    .split(';')
    .map((p) => p.trim().toLowerCase());
  const charset = params.find((p) => p.startsWith('charset='));
  if (
    type !== 'text/csv' ||
    (charset && !/^charset="?utf-?8"?$/.test(charset))
  ) {
    throw new UnsupportedMediaTypeException({
      code: 'UNSUPPORTED_MEDIA_TYPE',
      message: 'Upload a UTF-8 CSV file.',
    });
  }
  const tooLarge = () =>
    new PayloadTooLargeException({
      code: 'FILE_TOO_LARGE',
      message: `The file is too large. The limit is ${limit / 1024 / 1024} MB.`,
    });
  if (Number(req.headers['content-length'] ?? 0) > limit) throw tooLarge();

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += buf.length;
    if (size > limit) throw tooLarge();
    chunks.push(buf);
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(
      Buffer.concat(chunks),
    );
  } catch {
    throw new BadRequestException({
      code: 'INVALID_ENCODING',
      message: 'The file must be saved as UTF-8 text.',
    });
  }
}

@Injectable()
export class CsvBodyMiddleware implements NestMiddleware {
  async use(req: CsvRequest, _res: unknown, next: () => void): Promise<void> {
    req.body = await readCsvBody(req);
    next();
  }
}
