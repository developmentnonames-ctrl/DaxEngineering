import { NextResponse, type NextRequest } from 'next/server';
import { buildCsp } from '@dax/web-data-access';

export function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = [
    buildCsp({
      nonce,
      dev: process.env.NODE_ENV === 'development',
      wasm: true,
    }),
    // 'strict-dynamic' in script-src ignores 'self', so the service worker and manifest need their own sources.
    "worker-src 'self'",
    "manifest-src 'self'",
  ].join('; ');
  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('content-security-policy', csp);
  headers.set(
    'x-dax-path',
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('content-security-policy', csp);
  response.headers.set('cache-control', 'private, no-store');
  return response;
}

export const config = {
  matcher: [
    {
      // Uploads skip the proxy, which would buffer the body and cut it at 10 MB.
      // Label PDFs skip it so the browser's PDF viewer is not blocked by the page CSP.
      source:
        '/((?!_next/static|_next/image|favicon.ico|healthz|api/files|api/labels|sw.js|manifest.webmanifest|offline.html|icons/|zxing/).*)',
      missing: [{ type: 'header', key: 'next-router-prefetch' }],
    },
  ],
};
