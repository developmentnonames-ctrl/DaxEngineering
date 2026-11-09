import { LabelRequest } from '@dax/inventory-contract';
import {
  contentDisposition,
  isSameOrigin,
  plainText,
  readServerConfig,
  relayFile,
} from '@dax/web-data-access/server';
import { APP, api } from '../../../lib/server';

export const dynamic = 'force-dynamic';

const MAX_FORM_BYTES = 64 * 1024;

function numberField(form: FormData, key: string): number | undefined {
  const value = form.get(key);
  return typeof value === 'string' && value.trim() !== ''
    ? Number(value)
    : undefined;
}

export async function POST(request: Request): Promise<Response> {
  const config = readServerConfig(APP);
  if (!isSameOrigin(request, config.publicOrigin)) {
    return plainText(403, 'This request was blocked.');
  }
  if (Number(request.headers.get('content-length') ?? 0) > MAX_FORM_BYTES) {
    return plainText(413, 'Too many labels in one go.');
  }
  const form = await request.formData().catch(() => null);
  if (!form) return plainText(400, 'The label request could not be read.');

  const parsed = LabelRequest.safeParse({
    kind: form.get('kind'),
    ids: form.getAll('ids'),
    copies: numberField(form, 'copies'),
    skip: numberField(form, 'skip'),
  });
  if (!parsed.success) {
    return plainText(400, 'Choose between 1 and 240 labels, then try again.');
  }

  const upstream = await api.call('/inventory/labels', {
    method: 'POST',
    json: parsed.data,
    accept: 'application/pdf',
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
        ? "You don't have permission to print these labels."
        : 'The labels could not be made. Close this tab and try again.',
    );
  }
  return relayFile(upstream, {
    contentType: 'application/pdf',
    disposition: contentDisposition('inline', `${parsed.data.kind}-labels.pdf`),
  });
}
