import 'server-only';
import { cookies, headers } from 'next/headers';
import { cache } from 'react';
import { type AppName, MeResponse } from '@dax/platform-contract';
import { apiUrl } from './api-url';
import { forwardHeaders, readServerConfig } from './config';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: { code?: string; message?: string; fields?: string[] },
  ) {
    super(body.message ?? `API responded ${status}`);
  }
}

async function incomingHeaders(): Promise<Headers> {
  const [h, c] = await Promise.all([headers(), cookies()]);
  const out = new Headers(h);
  out.set('cookie', c.toString());
  return out;
}

export function createApi(app: AppName) {
  async function call(
    path: string,
    init: { method?: string; json?: unknown } = {},
  ): Promise<Response> {
    const incoming = await incomingHeaders();
    const config = readServerConfig(app);
    const h = forwardHeaders(app, config, incoming);
    if (init.json !== undefined) h.set('content-type', 'application/json');
    return fetch(apiUrl(path, config.apiUrl), {
      method: init.method ?? 'GET',
      headers: h,
      body: init.json === undefined ? undefined : JSON.stringify(init.json),
      cache: 'no-store',
      redirect: 'manual',
    });
  }

  async function request<T>(
    path: string,
    parse: (data: unknown) => T,
    init: { method?: string; json?: unknown } = {},
  ): Promise<T> {
    const res = await call(path, init);
    const text = await res.text();
    const data: unknown = text ? JSON.parse(text) : undefined;
    if (!res.ok) {
      throw new ApiError(
        res.status,
        (data ?? {}) as { code?: string; message?: string },
      );
    }
    return parse(data);
  }

  const getMe = cache(async (): Promise<MeResponse | null> => {
    const res = await call('/me');
    if (res.status === 401) return null;
    if (!res.ok) throw new ApiError(res.status, {});
    return MeResponse.parse(await res.json());
  });

  return { call, request, getMe };
}
