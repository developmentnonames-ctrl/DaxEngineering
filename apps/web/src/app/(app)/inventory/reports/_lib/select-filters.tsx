'use client';

import { Loader, Select } from '@mantine/core';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

export interface ReportSelect {
  name: string;
  label: string;
  data: { value: string; label: string }[];
  placeholder?: string;
  /** Value the API assumes when the parameter is absent; makes it required. */
  defaultValue?: string;
}

export function SelectFilters({ selects }: { selects: ReportSelect[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function go(name: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(name, value);
    else next.delete(name);
    const query = next.toString();
    startTransition(() =>
      router.push(query ? `${pathname}?${query}` : pathname),
    );
  }

  return (
    <div className="dax-filters dax-no-print" role="search">
      {selects.map((s) => (
        <Select
          key={s.name}
          label={s.label}
          data={s.data}
          placeholder={s.placeholder}
          value={params.get(s.name) ?? s.defaultValue ?? null}
          onChange={(v) => go(s.name, v === s.defaultValue ? null : v)}
          clearable={s.defaultValue === undefined}
          allowDeselect={false}
          searchable={s.data.length > 8}
          comboboxProps={{ withinPortal: true }}
          style={{ flex: '1 1 200px', maxWidth: 300 }}
        />
      ))}
      {pending ? <Loader size={18} /> : null}
    </div>
  );
}
