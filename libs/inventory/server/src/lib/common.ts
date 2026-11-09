import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  type EntityDef,
  type Policy,
  readableFields,
} from '@dax/platform-core';
import type { z } from 'zod';

export const MODULE_KEY = 'inventory';
export const SYSTEM_ACTOR_ID = '00000000-0000-0000-0000-000000000000';

export function parse<T extends z.ZodType>(
  schema: T,
  input: unknown,
): z.infer<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new BadRequestException({
      code: 'INVALID_INPUT',
      message:
        parsed.error.issues[0]?.message ?? 'Check the highlighted fields.',
      fields: [...new Set(parsed.error.issues.map((i) => i.path.join('.')))],
    });
  }
  return parsed.data;
}

export function invalid(message: string, fields: string[] = []): never {
  throw new BadRequestException({ code: 'INVALID_INPUT', message, fields });
}

export function conflict(code: string, message: string): never {
  throw new ConflictException({ code, message });
}

export function stale(): never {
  conflict('STALE', 'Someone else changed this. Reload and try again.');
}

export function notFound(message = 'Not found.'): never {
  throw new NotFoundException({ code: 'NOT_FOUND', message });
}

export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

export function canRead(policy: Policy, def: EntityDef, field: string) {
  return (
    def.fields[field]?.locked === true ||
    readableFields(policy, def.key).has(field)
  );
}

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export function newQrToken(length = 12): string {
  let out = '';
  while (out.length < length) {
    for (const byte of randomBytes(length * 2)) {
      // 248 = 4 * 62, so bytes below it map to base62 without bias.
      if (byte < 248) out += BASE62[byte % 62];
      if (out.length === length) break;
    }
  }
  return out;
}

export function encodeCursor(sortKey: string, id: string): string {
  return Buffer.from(JSON.stringify([sortKey, id])).toString('base64url');
}

export function decodeCursor(cursor: string): { key: string; id: string } {
  try {
    const value: unknown = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    );
    if (
      Array.isArray(value) &&
      value.length === 2 &&
      typeof value[0] === 'string' &&
      typeof value[1] === 'string'
    ) {
      return { key: value[0], id: value[1] };
    }
  } catch {
    // fall through to the error below
  }
  invalid('Bad cursor.', ['cursor']);
}

export function pageFrom<T>(
  rows: T[],
  limit: number,
  cursorOf: (row: T) => string,
): { rows: T[]; nextCursor: string | null } {
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    rows: page,
    nextCursor: rows.length > limit && last ? cursorOf(last) : null,
  };
}
