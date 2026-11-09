import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, type Observable, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { Prisma, type PrismaService } from '@dax/platform-db';
import {
  IdempotencyInterceptor,
  REPLAYED_HEADER,
  requestHash,
} from './idempotency.interceptor';

interface Row {
  userId: string;
  key: string;
  route: string;
  requestHash: string;
  statusCode: number | null;
  response: unknown;
}

type KeyWhere = { where: { userId_key: { userId: string; key: string } } };

const USER = 'user-1';
const KEY = 'post-grn-0001';

function fakePrisma() {
  const rows = new Map<string, Row>();
  const id = (w: KeyWhere['where']) =>
    `${w.userId_key.userId}|${w.userId_key.key}`;
  const idempotencyKey = {
    create: vi.fn(
      async ({ data }: { data: Omit<Row, 'statusCode' | 'response'> }) => {
        const k = `${data.userId}|${data.key}`;
        if (rows.has(k)) {
          throw new Prisma.PrismaClientKnownRequestError(
            'Unique constraint failed',
            {
              code: 'P2002',
              clientVersion: 'test',
            },
          );
        }
        const row = { ...data, statusCode: null, response: null };
        rows.set(k, row);
        return row;
      },
    ),
    findUnique: vi.fn(async ({ where }: KeyWhere) => {
      const row = rows.get(id(where));
      return row ? { ...row } : null;
    }),
    update: vi.fn(
      async ({
        where,
        data,
      }: KeyWhere & { data: { statusCode: number; response: unknown } }) => {
        const row = rows.get(id(where));
        if (!row) throw new Error('not found');
        row.statusCode = data.statusCode;
        row.response = data.response === Prisma.DbNull ? null : data.response;
        return row;
      },
    ),
    delete: vi.fn(async ({ where }: KeyWhere) => {
      rows.delete(id(where));
    }),
  };
  return {
    prisma: { idempotencyKey } as unknown as PrismaService,
    idempotencyKey,
    rows,
  };
}

interface FakeReq {
  method: string;
  originalUrl: string;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
  auth?: {
    sessionId: string;
    user: { id: string; name: string; email: string };
  };
}

function http(req: Partial<FakeReq> = {}) {
  const request: FakeReq = {
    method: 'POST',
    originalUrl: '/inventory/grn/abc/post',
    headers: { 'idempotency-key': KEY },
    body: { lines: [{ itemId: 'i1', qty: 2 }] },
    auth: {
      sessionId: 's',
      user: { id: USER, name: 'Stores Keeper', email: 'k@x.lk' },
    },
    ...req,
  };
  const response = {
    statusCode: 201,
    headers: {} as Record<string, string>,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
  };
  const context = {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
  return { context, request, response };
}

function handler(result: () => Observable<unknown>) {
  const handle = vi.fn(result);
  return { handle } as CallHandler & { handle: typeof handle };
}

async function run(
  interceptor: IdempotencyInterceptor,
  context: ExecutionContext,
  next: CallHandler,
): Promise<unknown> {
  return lastValueFrom(await interceptor.intercept(context, next), {
    defaultValue: undefined,
  });
}

async function failure(
  promise: Promise<unknown>,
): Promise<{ status: number; code: string }> {
  try {
    await promise;
  } catch (error) {
    const e = error as { getStatus(): number; getResponse(): { code: string } };
    return { status: e.getStatus(), code: e.getResponse().code };
  }
  throw new Error('expected a failure');
}

describe('requestHash', () => {
  it('changes with method, route or body', () => {
    const base = requestHash('POST', '/a', { x: 1 });
    expect(base).toMatch(/^[0-9a-f]{64}$/);
    expect(requestHash('post', '/a', { x: 1 })).toBe(base);
    expect(requestHash('PUT', '/a', { x: 1 })).not.toBe(base);
    expect(requestHash('POST', '/b', { x: 1 })).not.toBe(base);
    expect(requestHash('POST', '/a', { x: 2 })).not.toBe(base);
  });
});

describe('IdempotencyInterceptor', () => {
  it('stores the first response and replays it for a retry', async () => {
    const fake = fakePrisma();
    const interceptor = new IdempotencyInterceptor(fake.prisma);
    const next = handler(() => of({ number: 'GRN/FOR/26/0001' }));

    const first = http();
    expect(await run(interceptor, first.context, next)).toEqual({
      number: 'GRN/FOR/26/0001',
    });
    expect(fake.rows.get(`${USER}|${KEY}`)).toMatchObject({
      route: '/inventory/grn/abc/post',
      statusCode: 201,
      response: { number: 'GRN/FOR/26/0001' },
    });

    const retry = http();
    retry.response.statusCode = 200;
    expect(await run(interceptor, retry.context, next)).toEqual({
      number: 'GRN/FOR/26/0001',
    });
    expect(retry.response.statusCode).toBe(201);
    expect(retry.response.headers[REPLAYED_HEADER]).toBe('true');
    expect(next.handle).toHaveBeenCalledTimes(1);
  });

  it('replays an empty response', async () => {
    const fake = fakePrisma();
    const interceptor = new IdempotencyInterceptor(fake.prisma);
    const next = handler(() => of(undefined));
    await run(interceptor, http().context, next);
    expect(fake.rows.get(`${USER}|${KEY}`)).toMatchObject({
      statusCode: 201,
      response: null,
    });
    expect(await run(interceptor, http().context, next)).toBeUndefined();
    expect(next.handle).toHaveBeenCalledTimes(1);
  });

  it('answers 409 IN_PROGRESS while the first request is still running', async () => {
    const fake = fakePrisma();
    const interceptor = new IdempotencyInterceptor(fake.prisma);
    fake.rows.set(`${USER}|${KEY}`, {
      userId: USER,
      key: KEY,
      route: '/inventory/grn/abc/post',
      requestHash: requestHash('POST', '/inventory/grn/abc/post', {
        lines: [{ itemId: 'i1', qty: 2 }],
      }),
      statusCode: null,
      response: null,
    });
    const next = handler(() => of('never'));
    expect(await failure(run(interceptor, http().context, next))).toEqual({
      status: 409,
      code: 'IN_PROGRESS',
    });
    expect(next.handle).not.toHaveBeenCalled();
  });

  it('answers 422 when the key is reused for a different body or route', async () => {
    const fake = fakePrisma();
    const interceptor = new IdempotencyInterceptor(fake.prisma);
    const next = handler(() => of({ ok: true }));
    await run(interceptor, http().context, next);

    const otherBody = http({ body: { lines: [] } });
    expect(await failure(run(interceptor, otherBody.context, next))).toEqual({
      status: 422,
      code: 'IDEMPOTENCY_KEY_REUSED',
    });
    const otherRoute = http({ originalUrl: '/inventory/grn/xyz/post' });
    expect(await failure(run(interceptor, otherRoute.context, next))).toEqual({
      status: 422,
      code: 'IDEMPOTENCY_KEY_REUSED',
    });
    expect(next.handle).toHaveBeenCalledTimes(1);
  });

  it('releases the key when the handler fails so the client can retry', async () => {
    const fake = fakePrisma();
    const interceptor = new IdempotencyInterceptor(fake.prisma);
    const boom = new Error('stock went negative');
    const failing = handler(() => throwError(() => boom));
    await expect(run(interceptor, http().context, failing)).rejects.toBe(boom);
    expect(fake.rows.size).toBe(0);

    const next = handler(() => of({ ok: true }));
    expect(await run(interceptor, http().context, next)).toEqual({ ok: true });
  });

  it('keeps the users’ keys apart', async () => {
    const fake = fakePrisma();
    const interceptor = new IdempotencyInterceptor(fake.prisma);
    const next = handler(() => of({ ok: true }));
    await run(interceptor, http().context, next);
    const other = http({
      auth: {
        sessionId: 's2',
        user: { id: 'user-2', name: 'Stores Manager', email: 'm@x.lk' },
      },
      body: { lines: [] },
    });
    expect(await run(interceptor, other.context, next)).toEqual({ ok: true });
    expect(next.handle).toHaveBeenCalledTimes(2);
  });

  it('retries the claim when the earlier row was released meanwhile', async () => {
    const fake = fakePrisma();
    const interceptor = new IdempotencyInterceptor(fake.prisma);
    fake.idempotencyKey.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    const next = handler(() => of({ ok: true }));
    expect(await run(interceptor, http().context, next)).toEqual({ ok: true });
    expect(fake.idempotencyKey.create).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['GET requests', { method: 'GET' }],
    ['requests without the header', { headers: {} }],
    ['anonymous requests', { auth: undefined }],
  ])('passes through %s', async (_, req) => {
    const fake = fakePrisma();
    const interceptor = new IdempotencyInterceptor(fake.prisma);
    const next = handler(() => of({ ok: true }));
    expect(await run(interceptor, http(req).context, next)).toEqual({
      ok: true,
    });
    expect(fake.idempotencyKey.create).not.toHaveBeenCalled();
  });

  it.each(['short', 'x'.repeat(65), 'has space!', 'ключ-ключ-ключ'])(
    'rejects a malformed key %#',
    async (key) => {
      const fake = fakePrisma();
      const interceptor = new IdempotencyInterceptor(fake.prisma);
      const next = handler(() => of({ ok: true }));
      expect(
        await failure(
          run(
            interceptor,
            http({ headers: { 'idempotency-key': key } }).context,
            next,
          ),
        ),
      ).toEqual({ status: 400, code: 'INVALID_IDEMPOTENCY_KEY' });
    },
  );

  it('still returns the response when storing it fails', async () => {
    const fake = fakePrisma();
    const interceptor = new IdempotencyInterceptor(fake.prisma);
    fake.idempotencyKey.update.mockRejectedValueOnce(new Error('db down'));
    const next = handler(() => of({ ok: true }));
    expect(await run(interceptor, http().context, next)).toEqual({ ok: true });
    expect(fake.rows.get(`${USER}|${KEY}`)?.statusCode).toBeNull();
  });
});
