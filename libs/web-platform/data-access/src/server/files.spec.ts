import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const { capBody, createFileRoutes, MAX_UPLOAD_REQUEST_BYTES, readDownloadUrl } =
  await import('./files');

const ORIGIN = 'https://app.example.test';
const ID = '01970000-0000-7000-8000-000000000001';
const SIGNED = 'https://bucket.r2.example.test/inventory/x?X-Amz-Signature=abc';

function uploadRequest(
  init: {
    origin?: string;
    contentType?: string;
    body?: ReadableStream<Uint8Array> | string | null;
    length?: string;
  } = {},
) {
  const form = new FormData();
  form.set('entityKey', 'inventory.grn');
  form.set(
    'file',
    new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])]),
    'a.png',
  );
  const encoded = new Request(ORIGIN, { method: 'POST', body: form });
  const headers = new Headers({
    origin: init.origin ?? ORIGIN,
    cookie: 'dax-web.session_token=s; dax-admin.session_token=a; theme=dark',
    'content-type':
      init.contentType ?? encoded.headers.get('content-type') ?? '',
  });
  if (init.length) headers.set('content-length', init.length);
  return new Request(`${ORIGIN}/api/files`, {
    method: 'POST',
    headers,
    body: init.body ?? encoded.body,
    duplex: 'half',
  } as RequestInit);
}

function downloadRequest(site?: string) {
  const headers = new Headers({ cookie: 'dax-web.session_token=s; other=1' });
  if (site) headers.set('sec-fetch-site', site);
  return new Request(`${ORIGIN}/files/${ID}`, { headers });
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.stubEnv('API_INTERNAL_URL', 'http://api.internal:3000');
  vi.stubEnv('INTERNAL_TOKEN_WEB', 'web-internal-token');
  vi.stubEnv('WEB_ORIGIN', ORIGIN);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('upload', () => {
  it('streams the form to the API with only this app’s cookies', async () => {
    const upstream = vi.fn(async (_url: URL, init: RequestInit) => {
      const text = await new Response(init.body).text();
      expect(text).toContain('inventory.grn');
      return new Response(JSON.stringify({ id: ID }), { status: 201 });
    });
    vi.stubGlobal('fetch', upstream);

    const res = await createFileRoutes('web').upload(uploadRequest());

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: ID });
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    const [url, init] = upstream.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe('http://api.internal:3000/api/attachments');
    const sent = new Headers(init.headers);
    expect(sent.get('x-internal-token')).toBe('web-internal-token');
    expect(sent.get('cookie')).toBe('dax-web.session_token=s');
    expect(sent.get('content-type')).toMatch(
      /^multipart\/form-data; boundary=/,
    );
  });

  it('refuses cross-origin, non-multipart and oversized uploads without calling the API', async () => {
    const upstream = vi.fn();
    vi.stubGlobal('fetch', upstream);
    const { upload } = createFileRoutes('web');

    expect(
      (await upload(uploadRequest({ origin: 'https://evil.test' }))).status,
    ).toBe(403);
    expect(
      (
        await upload(
          uploadRequest({ contentType: 'application/json', body: '{}' }),
        )
      ).status,
    ).toBe(415);
    expect(
      (
        await upload(
          uploadRequest({ length: String(MAX_UPLOAD_REQUEST_BYTES + 1) }),
        )
      ).status,
    ).toBe(413);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('answers 413 when a body without a length runs past the cap', async () => {
    vi.stubGlobal('fetch', async (_url: URL, init: RequestInit) => {
      await new Response(init.body).arrayBuffer();
      return new Response('{}');
    });
    const huge = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(1024 * 1024));
      },
    });
    const res = await createFileRoutes('web').upload(
      uploadRequest({
        contentType: 'multipart/form-data; boundary=x',
        body: huge,
      }),
    );
    expect(res.status).toBe(413);
  });
});

describe('capBody', () => {
  it('passes small bodies through untouched', async () => {
    const capped = capBody(
      new Response('hello').body as ReadableStream<Uint8Array>,
      10,
    );
    expect(await new Response(capped.stream).text()).toBe('hello');
    expect(capped.exceeded()).toBe(false);
  });
});

describe('download', () => {
  it('redirects to the signed URL without caching or leaking the referrer', async () => {
    const upstream = vi.fn(
      async () => new Response(JSON.stringify({ url: SIGNED, expiresIn: 60 })),
    );
    vi.stubGlobal('fetch', upstream);

    const res = await createFileRoutes('web').download(
      downloadRequest('same-origin'),
      params(ID),
    );

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(SIGNED);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    const [url, init] = upstream.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe(
      `http://api.internal:3000/api/attachments/${ID}/download-url`,
    );
    expect(new Headers(init.headers).get('cookie')).toBe(
      'dax-web.session_token=s',
    );
  });

  it('mirrors 404 and sends signed-out users to sign in', async () => {
    const { download } = createFileRoutes('web');
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 404 }));
    expect((await download(downloadRequest(), params(ID))).status).toBe(404);

    vi.stubGlobal('fetch', async () => new Response('{}', { status: 401 }));
    const res = await download(downloadRequest(), params(ID));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/login');
  });

  it('rejects bad ids and cross-site requests without calling the API', async () => {
    const upstream = vi.fn();
    vi.stubGlobal('fetch', upstream);
    const { download } = createFileRoutes('web');
    expect((await download(downloadRequest(), params('../me'))).status).toBe(
      404,
    );
    expect(
      (await download(downloadRequest('cross-site'), params(ID))).status,
    ).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('never redirects to a non-http URL', () => {
    expect(readDownloadUrl({ url: 'javascript:alert(1)' })).toBeNull();
    expect(readDownloadUrl({ url: 42 })).toBeNull();
    expect(readDownloadUrl(null)).toBeNull();
    expect(readDownloadUrl({ url: SIGNED })).toBe(SIGNED);
  });
});
