import {
  BinStockQuery,
  MovementReportQuery,
  SlowMovingQuery,
} from '@dax/inventory-contract';
import {
  contentDisposition,
  plainText,
  relayFile,
} from '@dax/web-data-access/server';
import {
  isReportSlug,
  type ReportSlug,
} from '../../../(app)/inventory/reports/_lib/reports';
import { flatten, readQuery, toQuery } from '../../../../lib/query';
import { api } from '../../../../lib/server';

export const dynamic = 'force-dynamic';

function upstreamPath(slug: ReportSlug, search: URLSearchParams): string {
  const raw = flatten(Object.fromEntries(search));
  switch (slug) {
    case 'below-minimum':
      return '/inventory/reports/below-min/csv';
    case 'movements':
      return `/inventory/reports/movements/csv${toQuery({
        ...readQuery(MovementReportQuery, raw),
        page: undefined,
        limit: undefined,
      })}`;
    case 'stock-by-bin':
      return `/inventory/reports/stock-by-bin/csv${toQuery(readQuery(BinStockQuery, raw))}`;
    case 'slow-moving':
      return `/inventory/reports/slow-moving/csv${toQuery(readQuery(SlowMovingQuery, raw))}`;
  }
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ report: string }> },
): Promise<Response> {
  if (request.headers.get('sec-fetch-site') === 'cross-site') {
    return plainText(403, 'This request was blocked.');
  }
  const { report } = await ctx.params;
  if (!isReportSlug(report)) return plainText(404, 'Report not found.');

  const upstream = await api.call(
    upstreamPath(report, new URL(request.url).searchParams),
    { accept: 'text/csv' },
  );
  if (upstream.status === 401) {
    await upstream.body?.cancel();
    return new Response(null, {
      status: 303,
      headers: { location: '/login', 'cache-control': 'private, no-store' },
    });
  }
  if (!upstream.ok) {
    await upstream.body?.cancel();
    const status = [400, 403].includes(upstream.status) ? upstream.status : 502;
    return plainText(
      status,
      status === 403
        ? "You don't have permission to export this report."
        : status === 400
          ? 'Check the report filters and try again.'
          : 'The report could not be exported. Try again.',
    );
  }
  const name =
    /filename="([^"]+)"/.exec(
      upstream.headers.get('content-disposition') ?? '',
    )?.[1] ?? `${report}.csv`;
  return relayFile(upstream, {
    contentType: 'text/csv; charset=utf-8',
    disposition: contentDisposition('attachment', name),
  });
}
