import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const { createAuthProxy, isAllowedAuthPath, isSameOrigin, sanitizeAuthBody } =
  await import('./auth-proxy');
const { appCookies, clientIp } = await import('./config');
const { buildCsp } = await import('./csp');

const ORIGIN = 'https://app.example.test';

function params(...all: string[]) {
  return { params: Promise.resolve({ all }) };
}

function post(path: string, init: { origin?: string; cookie?: string } = {}) {
  return new Request(`${ORIGIN}/api/auth/${path}`, {
    method: 'POST',
    headers: {
      origin: init.origin ?? ORIGIN,
      cookie: init.cookie ?? '',
      'content-type': 'application/json',
      'x-forwarded-for': '203.0.113.9, 10.0.0.2',
    },
    body: JSON.stringify({ username: 'kasun', password: 'x' }),
  });
}

describe('auth proxy rules', () => {
  it('allows only the sign-in, password and two-step endpoints', () => {
    expect(isAllowedAuthPath('POST', 'sign-in/username')).toBe(true);
    expect(isAllowedAuthPath('POST', 'two-factor/verify-totp')).toBe(true);
    expect(isAllowedAuthPath('POST', 'sign-up/email')).toBe(false);
    expect(isAllowedAuthPath('GET', 'get-session')).toBe(false);
    expect(isAllowedAuthPath('POST', 'list-sessions')).toBe(false);
  });

  it('never passes the session token or user record to the browser', () => {
    expect(
      sanitizeAuthBody({
        token: 'secret',
        user: { id: '1' },
        redirect: false,
        twoFactorRedirect: true,
      }),
    ).toEqual({ twoFactorRedirect: true });
    expect(sanitizeAuthBody('nope')).toEqual({});
  });

  it('requires a same-origin request', () => {
    expect(isSameOrigin(post('sign-out'), ORIGIN)).toBe(true);
    expect(
      isSameOrigin(post('sign-out', { origin: 'https://evil.test' }), ORIGIN),
    ).toBe(false);
  });
});

describe('cookies and client ip', () => {
  it('forwards only this app’s session cookies', () => {
    const header =
      'dax-web.session_token=a; dax-admin.session_token=b; theme=dark; __Secure-dax-web.two_factor=c';
    expect(appCookies('web', header)).toBe(
      'dax-web.session_token=a; __Secure-dax-web.two_factor=c',
    );
    expect(appCookies('admin', header)).toBe('dax-admin.session_token=b');
    expect(appCookies('web', null)).toBe('');
  });

  it('takes the first forwarded address', () => {
    expect(
      clientIp(new Headers({ 'x-forwarded-for': '203.0.113.9, 10.0.0.2' })),
    ).toBe('203.0.113.9');
    expect(clientIp(new Headers())).toBeNull();
  });
});

describe('createAuthProxy', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  function stubEnv() {
    vi.stubEnv('API_INTERNAL_URL', 'http://api.internal:3000');
    vi.stubEnv('INTERNAL_TOKEN_WEB', 'web-internal-token');
    vi.stubEnv('WEB_ORIGIN', ORIGIN);
  }

  it('forwards an allowed call and strips the response', async () => {
    stubEnv();
    const upstream = vi.fn(
      async () =>
        new Response(JSON.stringify({ token: 'secret', user: { id: '1' } }), {
          status: 200,
          headers: {
            'set-cookie': 'dax-web.session_token=abc; Path=/; HttpOnly',
          },
        }),
    );
    vi.stubGlobal('fetch', upstream);

    const res = await createAuthProxy('web')(
      post('sign-in/username', {
        cookie: 'dax-web.session_token=old; dax-admin.session_token=adm',
      }),
      params('sign-in', 'username'),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    expect(res.headers.get('set-cookie')).toContain(
      'dax-web.session_token=abc',
    );
    expect(res.headers.get('cache-control')).toBe('private, no-store');

    const [url, init] = upstream.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe(
      'http://api.internal:3000/api/auth/sign-in/username',
    );
    const sent = new Headers(init.headers);
    expect(sent.get('x-internal-token')).toBe('web-internal-token');
    expect(sent.get('cookie')).toBe('dax-web.session_token=old');
    expect(sent.get('x-dax-client-ip')).toBe('203.0.113.9');
    expect(sent.get('origin')).toBe(ORIGIN);
  });

  it('rejects unknown paths and cross-origin calls without calling the API', async () => {
    stubEnv();
    const upstream = vi.fn();
    vi.stubGlobal('fetch', upstream);
    const proxy = createAuthProxy('web');

    expect(
      (await proxy(post('sign-up/email'), params('sign-up', 'email'))).status,
    ).toBe(404);
    expect(
      (
        await proxy(
          post('sign-out', { origin: 'https://evil.test' }),
          params('sign-out'),
        )
      ).status,
    ).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });
});

describe('buildCsp', () => {
  it('locks scripts to a nonce and forbids framing', () => {
    const csp = buildCsp({ nonce: 'abc', dev: false });
    expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain('unsafe-eval');
  });

  it('allows eval only in development', () => {
    expect(buildCsp({ nonce: 'n', dev: true })).toContain("'unsafe-eval'");
  });
});
