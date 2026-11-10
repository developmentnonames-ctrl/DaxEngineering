import { Prisma } from '@dax/platform-db';
import { dec, type DecimalLike } from '../stock-math';

const DAY_MS = 86_400_000;
// Sri Lanka has kept UTC+05:30 without daylight saving since 2006.
const COLOMBO_OFFSET_MS = 330 * 60_000;

export function colomboDayStart(day: string): Date {
  return new Date(`${day}T00:00:00.000+05:30`);
}

export function colomboRange(
  from: string | undefined,
  to: string | undefined,
): { gte?: Date; lt?: Date } | undefined {
  if (!from && !to) return undefined;
  return {
    ...(from ? { gte: colomboDayStart(from) } : {}),
    ...(to ? { lt: new Date(colomboDayStart(to).getTime() + DAY_MS) } : {}),
  };
}

export function colomboDay(at: Date): string {
  return new Date(at.getTime() + COLOMBO_OFFSET_MS).toISOString().slice(0, 10);
}

export function colomboDateTime(at: Date): string {
  return new Date(at.getTime() + COLOMBO_OFFSET_MS)
    .toISOString()
    .slice(0, 16)
    .replace('T', ' ');
}

function dayNumber(at: Date): number {
  return Math.floor((at.getTime() + COLOMBO_OFFSET_MS) / DAY_MS);
}

export function daysSince(at: Date, now: Date): number {
  return dayNumber(now) - dayNumber(at);
}

export function slowMovingCutoff(days: number, now: Date): Date {
  return new Date(
    colomboDayStart(colomboDay(now)).getTime() - (days - 1) * DAY_MS,
  );
}

export function freeOf(balance: {
  onHand: DecimalLike;
  held: DecimalLike;
  quarantine: DecimalLike;
  receiving: DecimalLike;
}): Prisma.Decimal {
  return dec(balance.onHand)
    .minus(dec(balance.held))
    .minus(dec(balance.quarantine))
    .minus(dec(balance.receiving));
}

export function shortBy(
  minQty: DecimalLike,
  free: DecimalLike,
): Prisma.Decimal {
  const gap = dec(minQty).minus(dec(free));
  return gap.gt(0) ? gap : new Prisma.Decimal(0);
}

export type CsvCell = string | number | boolean | null | undefined;

const NUMBER = /^-?\d+(\.\d+)?$/;
const BOM = String.fromCharCode(0xfeff);

export function csvCell(value: CsvCell): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text) && !NUMBER.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(
  header: readonly string[],
  rows: readonly (readonly CsvCell[])[],
): string {
  const lines = [header, ...rows].map((r) => r.map(csvCell).join(','));
  return `${BOM}${lines.join('\r\n')}\r\n`;
}
