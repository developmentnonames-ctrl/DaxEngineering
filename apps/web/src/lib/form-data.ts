export function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

export function flag(form: FormData, key: string): boolean {
  const value = form.get(key);
  return value === 'on' || value === 'true';
}

export function list(form: FormData, key: string): string[] {
  return form
    .getAll(key)
    .flatMap((v) => (typeof v === 'string' ? v.split(',') : []))
    .map((v) => v.trim())
    .filter(Boolean);
}

/** Empty strings mean "cleared", which the API stores as null. */
export function nullable(value: string): string | null {
  return value === '' ? null : value;
}
