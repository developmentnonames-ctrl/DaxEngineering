import 'server-only';
import { randomUUID } from 'node:crypto';
import type { AppName } from '@dax/platform-contract';

export interface ServerConfig {
  apiUrl: string;
  internalToken: string;
  publicOrigin: string;
}

export function readServerConfig(
  app: AppName,
  env: Record<string, string | undefined> = process.env,
): ServerConfig {
  const names = {
    apiUrl: 'API_INTERNAL_URL',
    internalToken: `INTERNAL_TOKEN_${app.toUpperCase()}`,
    publicOrigin: `${app.toUpperCase()}_ORIGIN`,
  };
  const missing = Object.values(names).filter((k) => !env[k]);
  if (missing.length) {
    throw new Error(`Missing server environment: ${missing.join(', ')}`);
  }
  return {
    apiUrl: env[names.apiUrl] as string,
    internalToken: env[names.internalToken] as string,
    publicOrigin: env[names.publicOrigin] as string,
  };
}

export function appCookies(app: AppName, cookieHeader: string | null): string {
  if (!cookieHeader) return '';
  const prefixes = [`dax-${app}.`, `__Secure-dax-${app}.`];
  return cookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter((part) => prefixes.some((p) => part.startsWith(p)))
    .join('; ');
}

export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || headers.get('x-real-ip') || null;
}

export function forwardHeaders(
  app: AppName,
  config: ServerConfig,
  incoming: Headers,
): Headers {
  const headers = new Headers();
  headers.set('x-internal-token', config.internalToken);
  headers.set('x-request-id', randomUUID());
  const cookies = appCookies(app, incoming.get('cookie'));
  if (cookies) headers.set('cookie', cookies);
  const ip = clientIp(incoming);
  if (ip) headers.set('x-dax-client-ip', ip);
  const agent = incoming.get('user-agent');
  if (agent) headers.set('user-agent', agent.slice(0, 512));
  return headers;
}
