import { NextResponse, type NextRequest } from 'next/server';
import { buildCsp } from '@dax/web-data-access';

export function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp({
    nonce,
    dev: process.env.NODE_ENV === 'development',
    wasm: true,
  });
  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('content-security-policy', csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('content-security-policy', csp);
  response.headers.set('cache-control', 'private, no-store');
  return response;
}

export const config = {
  matcher: [
    {
      // Uploads skip the proxy, which would buffer the body and cut it at 10 MB.
      source: '/((?!_next/static|_next/image|favicon.ico|healthz|api/files).*)',
      missing: [{ type: 'header', key: 'next-router-prefetch' }],
    },
  ],
};
