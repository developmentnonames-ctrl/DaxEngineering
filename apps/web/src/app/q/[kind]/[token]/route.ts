import { ScanResult } from '@dax/inventory-contract';
import { api, safePath } from '../../../../lib/server';

export const dynamic = 'force-dynamic';

const TOKEN = /^[A-Za-z0-9_-]{4,128}$/;

function go(location: string): Response {
  return new Response(null, {
    status: 303,
    headers: { location, 'cache-control': 'private, no-store' },
  });
}

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ kind: string; token: string }> },
): Promise<Response> {
  const { kind, token } = await ctx.params;
  if ((kind !== 'i' && kind !== 'b') || !TOKEN.test(token)) {
    return go('/scan?qr=none');
  }
  const upstream = await api.call(`/inventory/qr/${kind}/${token}`);
  if (upstream.status === 401) {
    await upstream.body?.cancel();
    return go(`/login?next=${encodeURIComponent(`/q/${kind}/${token}`)}`);
  }
  if (!upstream.ok) {
    await upstream.body?.cancel();
    return go(upstream.status === 403 ? '/scan?qr=denied' : '/scan?qr=none');
  }
  const parsed = ScanResult.safeParse(await upstream.json().catch(() => null));
  if (
    parsed.success &&
    (parsed.data.type === 'item' || parsed.data.type === 'bin')
  ) {
    const path = safePath(parsed.data.path);
    if (path) return go(path);
  }
  return go('/scan?qr=none');
}
