import type { PillTone } from '@dax/web-shell';
import { formatQty } from '../../../../../lib/format';

const QTY = /^\d{1,11}(\.\d{1,3})?$/;

export function isQty(value: string): boolean {
  return QTY.test(value.trim());
}

export function qtyNumber(value: string | null | undefined): number {
  const n = Number(value ?? '0');
  return Number.isFinite(n) ? n : 0;
}

export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function qtyText(n: number): string {
  return String(round3(Math.max(0, n)));
}

export interface LineFigures {
  qtyExpected: string | null;
  qtyGood: string;
  qtyDamaged: string;
  wrongItem: boolean;
}

export interface Hint {
  tone: PillTone;
  label: string;
}

export function lineHints(line: LineFigures): Hint[] {
  const good = qtyNumber(line.qtyGood);
  const damaged = qtyNumber(line.qtyDamaged);
  const received = round3(good + damaged);
  const hints: Hint[] = [];
  if (line.wrongItem) {
    hints.push({ tone: 'ext', label: 'Wrong item · flagged for the supplier' });
  }
  if (line.qtyExpected !== null && line.qtyExpected.trim() !== '') {
    const expected = qtyNumber(line.qtyExpected);
    if (received < expected) {
      hints.push({
        tone: 'bad',
        label: `Short ${formatQty(String(round3(expected - received)))}`,
      });
    } else if (received > expected) {
      hints.push({
        tone: 'yel',
        label: `Extra ${formatQty(String(round3(received - expected)))} · flagged as excess`,
      });
    } else if (damaged === 0 && !line.wrongItem) {
      hints.push({ tone: 'ok', label: 'Matches the delivery note' });
    }
  }
  if (damaged > 0) {
    hints.push({
      tone: 'bad',
      label: `${formatQty(String(damaged))} damaged · to quarantine`,
    });
  }
  return hints;
}

export function cardTone(hints: Hint[]): 'ok' | 'bad' | 'yel' | undefined {
  if (hints.some((h) => h.tone === 'bad')) return 'bad';
  if (hints.some((h) => h.tone === 'yel' || h.tone === 'ext')) return 'yel';
  if (hints.some((h) => h.tone === 'ok')) return 'ok';
  return undefined;
}

export interface PostSummary {
  goodLines: number;
  damagedLines: number;
  flagged: number;
}

export function summarize(lines: LineFigures[]): PostSummary {
  return {
    goodLines: lines.filter((l) => qtyNumber(l.qtyGood) > 0).length,
    damagedLines: lines.filter((l) => qtyNumber(l.qtyDamaged) > 0).length,
    flagged: lines.filter((l) => lineHints(l).some((h) => h.tone !== 'ok'))
      .length,
  };
}
