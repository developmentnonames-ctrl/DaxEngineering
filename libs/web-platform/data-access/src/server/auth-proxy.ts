import 'server-only';
import type { AppName } from '@dax/platform-contract';
import { apiUrl } from './api-url';
import { forwardHeaders, readServerConfig } from './config';

const ALLOWED_POSTS = new Set([
  'sign-in/email',
  'sign-in/username',
  'sign-out',
  'request-password-reset',
  'reset-password',
  'change-password',
  'two-factor/enable',
  'two-factor/disable',
  'two-factor/verify-totp',
  'two-factor/verify-backup-code',
  'two-factor/generate-backup-codes',
]);

const SAFE_BODY_KEYS = new Set([
  'status',
  'code',
  'message',
  'twoFactorRedirect',
  'twoFactorMethods',
  'totpURI',
  'backupCodes',
]);

const MAX_BODY_BYTES = 16 * 1024;

export function isAllowedAuthPath(method: string, path: string): boolean {
  return method === 'POST' && ALLOWED_POSTS.has(path);
}

export function sanitizeAuthBody(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return {};
  return Object.fromEntries(
    Object.entries(body).filter(([key]) => SAFE_BODY_KEYS.has(key)),
  );
}

export function isSameOrigin(request: Request, origin: string): boolean {
  if (request.headers.get('origin') !== origin) return false;
  const site = request.headers.get('sec-fetch-site');
  return site === null || site === 'same-origin';
}

function noStore(init: ResponseInit = {}): Headers {
  const headers = new Headers(init.headers);
  headers.set('Cache-Control', 'private, no-store');
  return headers;
}

export function createAuthProxy(app: AppName) {
  return async function POST(
    request: Request,
    ctx: { params: Promise<{ all: string[] }> },
  ): Promise<Response> {
    const config = readServerConfig(app);
    const path = (await ctx.params).all.join('/');
    if (!isAllowedAuthPath(request.method, path)) {
      return new Response(null, { status: 404, headers: noStore() });
    }
    if (!isSameOrigin(request, config.publicOrigin)) {
      return new Response(null, { status: 403, headers: noStore() });
    }
    const body = await request.arrayBuffer();
    if (body.byteLength > MAX_BODY_BYTES) {
      return new Response(null, { status: 413, headers: noStore() });
    }

    const headers = forwardHeaders(app, config, request.headers);
    headers.set('origin', config.publicOrigin);
    headers.set(
      'content-type',
      request.headers.get('content-type') ?? 'application/json',
    );
    const upstream = await fetch(apiUrl(`/auth/${path}`, config.apiUrl), {
      method: 'POST',
      headers,
      body,
      cache: 'no-store',
      redirect: 'manual',
    });

    const out = noStore();
    for (const cookie of upstream.headers.getSetCookie()) {
      out.append('set-cookie', cookie);
    }
    const text = await upstream.text();
    let payload: unknown = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }
    out.set('content-type', 'application/json');
    return new Response(JSON.stringify(sanitizeAuthBody(payload)), {
      status: upstream.status,
      headers: out,
    });
  };
}
