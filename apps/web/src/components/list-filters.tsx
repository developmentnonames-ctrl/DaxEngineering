'use client';

import { Button, Loader, Select, TextInput } from '@mantine/core';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, useState, useTransition } from 'react';
import { Icon } from '@dax/web-shell';

export interface FilterSelect {
  name: string;
  label: string;
  data: { value: string; label: string }[];
  /** Value the API assumes when the parameter is absent. */
  defaultValue?: string;
  placeholder?: string;
  /** Show the options as chips instead of a dropdown. */
  chips?: boolean;
}

export interface FilterToggle {
  name: string;
  label: string;
}

export function ListFilters({
  searchLabel = 'Search',
  searchPlaceholder,
  selects = [],
  toggles = [],
}: {
  searchLabel?: string;
  searchPlaceholder?: string;
  selects?: FilterSelect[];
  toggles?: FilterToggle[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [pending, startTransition] = useTransition();

  function go(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete('cursor');
    const query = next.toString();
    startTransition(() =>
      router.push(query ? `${pathname}?${query}` : pathname),
    );
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    go({ q: q.trim() || null });
  }

  const dropdowns = selects.filter((s) => !s.chips);
  const chipSets = selects.filter((s) => s.chips);
  const current = (s: FilterSelect) =>
    params.get(s.name) ?? s.defaultValue ?? '';

  return (
    <form
      onSubmit={submit}
      role="search"
      className="dax-stack"
      style={{ gap: 12 }}
    >
      <div className="dax-filters">
        <TextInput
          type="search"
          aria-label={searchLabel}
          placeholder={searchPlaceholder ?? searchLabel}
          value={q}
          onChange={(e) => setQ(e.currentTarget.value)}
          enterKeyHint="search"
          radius="xl"
          leftSection={<Icon name="search" size={18} />}
          rightSection={pending ? <Loader size={16} /> : null}
          style={{ flex: '1 1 240px', maxWidth: 460 }}
        />
        <Button type="submit" variant="default" loading={pending}>
          Search
        </Button>
        {dropdowns.map((s) => (
          <Select
            key={s.name}
            aria-label={s.label}
            data={s.data}
            placeholder={s.placeholder ?? `${s.label}: all`}
            value={params.get(s.name) ?? s.defaultValue ?? null}
            onChange={(value) =>
              go({ [s.name]: value === s.defaultValue ? null : value })
            }
            clearable={s.defaultValue === undefined}
            searchable={s.data.length > 8}
            allowDeselect={false}
            radius="xl"
            comboboxProps={{ withinPortal: true }}
            style={{ flex: '1 1 180px', maxWidth: 260 }}
          />
        ))}
      </div>
      {chipSets.length || toggles.length ? (
        <div className="dax-chip-groups">
          {chipSets.map((s) => (
            <div
              key={s.name}
              role="group"
              aria-label={s.label}
              className="dax-chips"
            >
              {s.data.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  aria-pressed={current(s) === o.value}
                  onClick={() =>
                    go({
                      [s.name]: o.value === s.defaultValue ? null : o.value,
                    })
                  }
                >
                  {o.label}
                </button>
              ))}
            </div>
          ))}
          {toggles.length ? (
            <div role="group" aria-label="Only show" className="dax-chips">
              {toggles.map((t) => {
                const on = params.get(t.name) === 'true';
                return (
                  <button
                    key={t.name}
                    type="button"
                    aria-pressed={on}
                    onClick={() => go({ [t.name]: on ? null : 'true' })}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
