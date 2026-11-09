import { z } from 'zod';

export const ScanCode = z.string().trim().min(1).max(512);

const LABEL_LINK = /\/q\/([ib])\/([A-Za-z0-9_-]{4,128})\/?$/;

export function scanLookupPath(code: string): string {
  const link = LABEL_LINK.exec(code.split(/[?#]/)[0] ?? '');
  return link
    ? `/inventory/qr/${link[1]}/${link[2]}`
    : `/inventory/scan?code=${encodeURIComponent(code)}`;
}
