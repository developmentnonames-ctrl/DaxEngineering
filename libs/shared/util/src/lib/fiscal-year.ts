export const DEFAULT_TIME_ZONE = 'Asia/Colombo';
export const DEFAULT_FY_START_MONTH = 4;

export interface FiscalYearOptions {
  startMonth?: number;
  timeZone?: string;
}

export interface FiscalYear {
  startYear: number;
  label: string;
  periodKey: string;
}

export function localDateParts(
  date: Date,
  timeZone: string,
): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const pick = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);
  return { year: pick('year'), month: pick('month'), day: pick('day') };
}

export function fiscalYearOf(
  date: Date,
  options: FiscalYearOptions = {},
): FiscalYear {
  const startMonth = options.startMonth ?? DEFAULT_FY_START_MONTH;
  if (!Number.isInteger(startMonth) || startMonth < 1 || startMonth > 12) {
    throw new RangeError(`startMonth must be 1-12, got ${startMonth}`);
  }
  const { year, month } = localDateParts(
    date,
    options.timeZone ?? DEFAULT_TIME_ZONE,
  );
  const startYear = month >= startMonth ? year : year - 1;
  return {
    startYear,
    label: String(startYear % 100).padStart(2, '0'),
    periodKey: `FY${startYear}`,
  };
}
