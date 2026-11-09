export const DEFAULT_DOC_PATTERN = '{DOC}/{SUB}/{FY}/{SEQ}';

export interface DocNumberParts {
  doc: string;
  sub?: string;
  fy: string;
  seq: number;
}

export function formatDocNumber(
  parts: DocNumberParts,
  pattern: string = DEFAULT_DOC_PATTERN,
  padding = 4,
): string {
  if (!Number.isInteger(parts.seq) || parts.seq < 1) {
    throw new RangeError(
      `Sequence must be a positive integer, got ${parts.seq}`,
    );
  }
  const seq = String(parts.seq).padStart(padding, '0');
  const withoutSub = parts.sub ? pattern : pattern.replace(/\{SUB\}[^{]*/, '');
  return withoutSub
    .replace('{DOC}', parts.doc)
    .replace('{SUB}', parts.sub ?? '')
    .replace('{FY}', parts.fy)
    .replace('{SEQ}', seq);
}
