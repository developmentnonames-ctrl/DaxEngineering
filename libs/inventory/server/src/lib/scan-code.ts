import { QR_PATHS, QR_TOKEN_PATTERN } from '@dax/inventory-contract';

export type QrKind = keyof typeof QR_PATHS;

export type ScanCode =
  | { kind: 'qr'; type: QrKind; token: string }
  | { kind: 'text'; value: string; maybeToken: boolean }
  | { kind: 'empty' };

const QR_PATH = /^\/q\/([a-z])\/([A-Za-z0-9]{12})\/?$/;
const BIN_CODE = /^[A-Z]{1,3}-\d{2,3}-\d{2}-[A-Z0-9]{1,3}$/;

export function qrKindOf(segment: string): QrKind | null {
  if (segment === QR_PATHS.item) return 'item';
  if (segment === QR_PATHS.bin) return 'bin';
  return null;
}

function fromPath(path: string): ScanCode | null {
  const match = QR_PATH.exec(path);
  const type = match ? qrKindOf(match[1] ?? '') : null;
  if (!match || !type) return null;
  return { kind: 'qr', type, token: match[2] ?? '' };
}

export function parseScanCode(raw: string): ScanCode {
  const value = raw.trim();
  if (!value) return { kind: 'empty' };
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      return fromPath(url.pathname) ?? { kind: 'empty' };
    } catch {
      return { kind: 'empty' };
    }
  }
  if (value.startsWith('/q/')) return fromPath(value) ?? { kind: 'empty' };
  return { kind: 'text', value, maybeToken: QR_TOKEN_PATTERN.test(value) };
}

export function looksLikeBinCode(value: string): boolean {
  return BIN_CODE.test(value.toUpperCase());
}
