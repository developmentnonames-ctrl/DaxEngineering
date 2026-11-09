import 'server-only';

export function apiUrl(
  path: string,
  base: string | undefined = process.env['API_INTERNAL_URL'],
): URL {
  if (!base) throw new Error('API_INTERNAL_URL is not set');
  if (!path.startsWith('/'))
    throw new Error(`API path must start with "/": ${path}`);
  return new URL(`/api${path}`, base);
}
