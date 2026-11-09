import 'server-only';
import { cookies, headers } from 'next/headers';
import { cache } from 'react';
import { type AppName, Capabilities, MeResponse } from '@dax/platform-contract';
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

export interface CallInit {
  method?: string;
  json?: unknown;
  /** Raw text body, e.g. a CSV upload; ignored when `json` is set. */
  body?: string;
  contentType?: string;
  accept?: string;
}

function parseJson(text: string): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function createApi(app: AppName) {
  async function call(path: string, init: CallInit = {}): Promise<Response> {
    const incoming = await incomingHeaders();
    const config = readServerConfig(app);
    const h = forwardHeaders(app, config, incoming);
    let body: string | undefined;
    if (init.json !== undefined) {
      h.set('content-type', 'application/json');
      body = JSON.stringify(init.json);
    } else if (init.body !== undefined) {
      h.set('content-type', init.contentType ?? 'text/plain; charset=utf-8');
      body = init.body;
    }
    if (init.accept) h.set('accept', init.accept);
    return fetch(apiUrl(path, config.apiUrl), {
      method: init.method ?? 'GET',
      headers: h,
      body,
      cache: 'no-store',
      redirect: 'manual',
    });
  }

  async function request<T>(
    path: string,
    parse: (data: unknown) => T,
    init: CallInit = {},
  ): Promise<T> {
    const res = await call(path, init);
    const data = parseJson(await res.text());
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

  const getCapabilities = cache(async (): Promise<Capabilities | null> => {
    const res = await call('/me/capabilities');
    if (res.status === 401) return null;
    if (!res.ok) throw new ApiError(res.status, {});
    return Capabilities.parse(await res.json());
  });

  return { call, request, getMe, getCapabilities };
}
