import {
  contentDisposition,
  plainText,
  relayFile,
} from '@dax/web-data-access/server';
import {
  IMPORT_API,
  IMPORT_KINDS,
  type ImportKind,
} from '../../../../lib/import';
import { api } from '../../../../lib/server';

export const dynamic = 'force-dynamic';

function isImportKind(value: string): value is ImportKind {
  return (IMPORT_KINDS as readonly string[]).includes(value);
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ kind: string }> },
): Promise<Response> {
  if (request.headers.get('sec-fetch-site') === 'cross-site') {
    return plainText(403, 'This request was blocked.');
  }
  const { kind } = await ctx.params;
  if (!isImportKind(kind)) return plainText(404, 'Template not found.');

  const upstream = await api.call(`${IMPORT_API[kind]}/template`, {
    accept: 'text/csv',
  });
  if (upstream.status === 401) {
    await upstream.body?.cancel();
    return new Response(null, {
      status: 303,
      headers: { location: '/login', 'cache-control': 'private, no-store' },
    });
  }
  if (!upstream.ok) {
    await upstream.body?.cancel();
    return plainText(
      upstream.status === 403 ? 403 : 502,
      upstream.status === 403
        ? "You don't have permission to import these."
        : 'The template could not be downloaded. Try again.',
    );
  }
  return relayFile(upstream, {
    contentType: 'text/csv; charset=utf-8',
    disposition: contentDisposition('attachment', `${kind}-template.csv`),
  });
}
