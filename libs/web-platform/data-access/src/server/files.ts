import 'server-only';
import type { AppName } from '@dax/platform-contract';
import { apiUrl } from './api-url';
import { isSameOrigin } from './auth-proxy';
import { forwardHeaders, readServerConfig } from './config';

export const MAX_FILE_BYTES = 15 * 1024 * 1024;
export const MAX_UPLOAD_REQUEST_BYTES = MAX_FILE_BYTES + 64 * 1024;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MESSAGES: Record<number, string> = {
  400: 'The upload could not be read.',
  403: "You don't have access to this file.",
  404: 'File not found.',
  413: 'Files can be up to 15 MB.',
  415: 'Upload the file as a form.',
  502: 'Something went wrong. Try again.',
  503: 'File storage is not available right now.',
};

function noStoreHeaders(extra: Record<string, string> = {}): Headers {
  const headers = new Headers(extra);
  headers.set('Cache-Control', 'private, no-store');
  return headers;
}

function plain(status: number): Response {
  return new Response(MESSAGES[status] ?? null, {
    status,
    headers: noStoreHeaders({ 'content-type': 'text/plain; charset=utf-8' }),
  });
}

export function capBody(
  body: ReadableStream<Uint8Array>,
  max: number,
): { stream: ReadableStream<Uint8Array>; exceeded: () => boolean } {
  let seen = 0;
  let exceeded = false;
  const stream = body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        seen += chunk.byteLength;
        if (seen > max) {
          exceeded = true;
          controller.error(new Error('Upload too large'));
          return;
        }
        controller.enqueue(chunk);
      },
    }),
  );
  return { stream, exceeded: () => exceeded };
}

export function readDownloadUrl(data: unknown): string | null {
  if (!data || typeof data !== 'object' || !('url' in data)) return null;
  const { url } = data;
  if (typeof url !== 'string') return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
      ? parsed.href
      : null;
  } catch {
    return null;
  }
}

async function relayJson(upstream: Response): Promise<Response> {
  const text = await upstream.text();
  let body = '{}';
  try {
    if (text) body = JSON.stringify(JSON.parse(text));
  } catch {
    body = '{}';
  }
  return new Response(body, {
    status: upstream.status,
    headers: noStoreHeaders({ 'content-type': 'application/json' }),
  });
}

export function createFileRoutes(app: AppName) {
  async function upload(request: Request): Promise<Response> {
    const config = readServerConfig(app);
    if (!isSameOrigin(request, config.publicOrigin)) return plain(403);
    const contentType = request.headers.get('content-type') ?? '';
    if (!/^multipart\/form-data;\s*boundary=/i.test(contentType))
      return plain(415);
    const declared = Number(request.headers.get('content-length') ?? 0);
    if (declared > MAX_UPLOAD_REQUEST_BYTES) return plain(413);
    if (!request.body) return plain(400);

    const capped = capBody(request.body, MAX_UPLOAD_REQUEST_BYTES);
    const headers = forwardHeaders(app, config, request.headers);
    headers.set('content-type', contentType);
    const init: RequestInit & { duplex: 'half' } = {
      method: 'POST',
      headers,
      body: capped.stream,
      duplex: 'half',
      cache: 'no-store',
      redirect: 'manual',
    };
    let upstream: Response;
    try {
      upstream = await fetch(apiUrl('/attachments', config.apiUrl), init);
    } catch (error) {
      if (capped.exceeded()) return plain(413);
      throw error;
    }
    return relayJson(upstream);
  }

  async function download(
    request: Request,
    ctx: { params: Promise<{ id: string }> },
  ): Promise<Response> {
    const config = readServerConfig(app);
    if (request.headers.get('sec-fetch-site') === 'cross-site')
      return plain(403);
    const { id } = await ctx.params;
    if (!UUID.test(id)) return plain(404);

    const upstream = await fetch(
      apiUrl(`/attachments/${id}/download-url`, config.apiUrl),
      {
        headers: forwardHeaders(app, config, request.headers),
        cache: 'no-store',
        redirect: 'manual',
      },
    );
    if (!upstream.ok) {
      await upstream.body?.cancel();
      if (upstream.status === 401) {
        return new Response(null, {
          status: 303,
          headers: noStoreHeaders({ location: '/login' }),
        });
      }
      return plain(
        [403, 404, 503].includes(upstream.status) ? upstream.status : 502,
      );
    }
    const url = readDownloadUrl(await upstream.json().catch(() => null));
    if (!url) return plain(502);
    return new Response(null, {
      status: 302,
      headers: noStoreHeaders({
        location: url,
        'Referrer-Policy': 'no-referrer',
      }),
    });
  }

  return { upload, download };
}
