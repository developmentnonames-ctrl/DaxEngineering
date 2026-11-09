export function buildCsp(options: {
  nonce: string;
  dev: boolean;
  wasm?: boolean;
}): string {
  const script = [
    "'self'",
    `'nonce-${options.nonce}'`,
    "'strict-dynamic'",
    ...(options.dev ? ["'unsafe-eval'"] : []),
    ...(options.wasm ? ["'wasm-unsafe-eval'"] : []),
  ];
  return [
    "default-src 'self'",
    `script-src ${script.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${options.dev ? ' ws:' : ''}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(options.dev ? [] : ['upgrade-insecure-requests']),
  ].join('; ');
}
