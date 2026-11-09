import { createHash } from 'node:crypto';
import {
  BadRequestException,
  type CallHandler,
  ConflictException,
  type ExecutionContext,
  Injectable,
  Logger,
  type NestInterceptor,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  catchError,
  from,
  mergeMap,
  type Observable,
  of,
  throwError,
} from 'rxjs';
import { Prisma, PrismaService } from '@dax/platform-db';
import type { DaxRequest } from '../auth/internal-caller';

export const IDEMPOTENCY_HEADER = 'idempotency-key';
export const REPLAYED_HEADER = 'Idempotent-Replayed';
const KEY_FORMAT = /^[A-Za-z0-9_-]{8,64}$/;
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const CLAIM_ATTEMPTS = 2;

interface KeyId {
  userId: string;
  key: string;
}

interface Replay {
  statusCode: number;
  body: unknown;
}

export function requestHash(
  method: string,
  route: string,
  body: unknown,
): string {
  return createHash('sha256')
    .update(
      `${method.toUpperCase()}\n${route}\n${JSON.stringify(body ?? null)}`,
    )
    .digest('hex');
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

function toStoredJson(
  body: unknown,
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  const text = JSON.stringify(body);
  if (text === undefined) return Prisma.DbNull;
  const parsed: unknown = JSON.parse(text);
  return parsed === null ? Prisma.DbNull : (parsed as Prisma.InputJsonValue);
}

// Prisma messages can echo the stored response, so only the error kind is logged.
function errorKind(error: unknown): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError) return error.code;
  return error instanceof Error ? error.name : typeof error;
}

function inProgress(): ConflictException {
  return new ConflictException({
    code: 'IN_PROGRESS',
    message: 'This request is still being processed. Try again shortly.',
  });
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Idempotency');

  constructor(private readonly prisma: PrismaService) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    if (context.getType() !== 'http') return next.handle();
    const http = context.switchToHttp();
    const req = http.getRequest<DaxRequest>();
    const header = req.headers[IDEMPOTENCY_HEADER];
    const userId = req.auth?.user.id;
    if (SAFE_METHODS.has(req.method) || header === undefined || !userId) {
      return next.handle();
    }
    if (typeof header !== 'string' || !KEY_FORMAT.test(header)) {
      throw new BadRequestException({
        code: 'INVALID_IDEMPOTENCY_KEY',
        message: 'Idempotency-Key must be 8-64 letters, digits, "-" or "_".',
      });
    }
    const id: KeyId = { userId, key: header };
    const route = req.originalUrl;
    const hash = requestHash(req.method, route, req.body);
    const res = http.getResponse<Response>();

    const replay = await this.claim(id, route, hash);
    if (replay) {
      res.status(replay.statusCode);
      res.setHeader(REPLAYED_HEADER, 'true');
      return of(replay.body);
    }
    return next.handle().pipe(
      catchError((error: unknown) =>
        from(this.release(id)).pipe(mergeMap(() => throwError(() => error))),
      ),
      mergeMap(async (body: unknown) => {
        await this.store(id, res.statusCode, body);
        return body;
      }),
    );
  }

  private async claim(
    id: KeyId,
    route: string,
    hash: string,
  ): Promise<Replay | null> {
    for (let attempt = 0; attempt < CLAIM_ATTEMPTS; attempt++) {
      try {
        await this.prisma.idempotencyKey.create({
          data: { ...id, route, requestHash: hash },
        });
        return null;
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
      const existing = await this.prisma.idempotencyKey.findUnique({
        where: { userId_key: id },
      });
      if (!existing) continue;
      if (existing.route !== route || existing.requestHash !== hash) {
        throw new UnprocessableEntityException({
          code: 'IDEMPOTENCY_KEY_REUSED',
          message:
            'This Idempotency-Key was already used for a different request.',
        });
      }
      if (existing.statusCode === null) throw inProgress();
      return {
        statusCode: existing.statusCode,
        body: existing.response ?? undefined,
      };
    }
    throw inProgress();
  }

  private async store(
    id: KeyId,
    statusCode: number,
    body: unknown,
  ): Promise<void> {
    try {
      await this.prisma.idempotencyKey.update({
        where: { userId_key: id },
        data: { statusCode, response: toStoredJson(body) },
      });
    } catch (error) {
      this.logger.warn(
        { err: errorKind(error) },
        'Could not store idempotent response',
      );
    }
  }

  private async release(id: KeyId): Promise<void> {
    try {
      await this.prisma.idempotencyKey.delete({ where: { userId_key: id } });
    } catch (error) {
      this.logger.warn(
        { err: errorKind(error) },
        'Could not release idempotency key',
      );
    }
  }
}
