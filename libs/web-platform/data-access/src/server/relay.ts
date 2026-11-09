import 'server-only';

export function contentDisposition(
  type: 'inline' | 'attachment',
  filename: string,
): string {
  return `${type}; filename="${filename.replace(/[^\w.-]/g, '_')}"`;
}

export function relayFile(
  upstream: Response,
  file: { contentType: string; disposition?: string },
): Response {
  const headers = new Headers({
    'content-type': file.contentType,
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
  });
  if (file.disposition) headers.set('content-disposition', file.disposition);
  const length = upstream.headers.get('content-length');
  if (length) headers.set('content-length', length);
  return new Response(upstream.body, { status: 200, headers });
}

export function plainText(status: number, message: string): Response {
  return new Response(message, {
    status,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'private, no-store',
    },
  });
}
