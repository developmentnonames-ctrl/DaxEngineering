export const ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

export type AllowedContentType = (typeof ALLOWED_CONTENT_TYPES)[number];

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const MAX_FILE_NAME_LENGTH = 120;

const EXTENSIONS: Record<AllowedContentType, readonly string[]> = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'application/pdf': ['.pdf'],
};

function startsWith(
  buffer: Uint8Array,
  bytes: readonly number[],
  offset = 0,
): boolean {
  if (buffer.length < offset + bytes.length) return false;
  return bytes.every((b, i) => buffer[offset + i] === b);
}

const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));

export function sniffContentType(
  buffer: Uint8Array,
): AllowedContentType | null {
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png';
  }
  if (
    startsWith(buffer, ascii('RIFF')) &&
    startsWith(buffer, ascii('WEBP'), 8)
  ) {
    return 'image/webp';
  }
  if (startsWith(buffer, ascii('%PDF-'))) return 'application/pdf';
  return null;
}

const UNSAFE_CHARS = /[\p{Cc}\p{Cf}"*:<>?|]/gu;

function truncate(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length > max ? chars.slice(0, max).join('') : text;
}

export function sanitizeFileName(
  raw: string,
  contentType: AllowedContentType,
): string {
  const base = raw.normalize('NFC').split(/[\\/]/).pop() ?? '';
  const cleaned = base
    .replace(UNSAFE_CHARS, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.]+|[\s.]+$/g, '');
  const allowed = EXTENSIONS[contentType];
  const dot = cleaned.lastIndexOf('.');
  const ext = dot > 0 ? cleaned.slice(dot).toLowerCase() : '';
  const hasExt = /^\.[a-z0-9]{1,8}$/.test(ext);
  const keepExt = hasExt && allowed.includes(ext);
  const stem = (hasExt ? cleaned.slice(0, dot) : cleaned).trim() || 'file';
  const suffix = keepExt ? ext : allowed[0];
  return `${truncate(stem, MAX_FILE_NAME_LENGTH - suffix.length).trim()}${suffix}`;
}

export function contentDisposition(fileName: string): string {
  const fallback = fileName.replace(/[^\x20-\x7e]|["\\%]/g, '_');
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
