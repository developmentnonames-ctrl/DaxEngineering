const colomboDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Colombo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function dayEndIso(day: string): string {
  return new Date(`${day}T23:59:59+05:30`).toISOString();
}

export function isoToDay(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : colomboDay.format(d);
}
