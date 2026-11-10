'use client';

import { Button, Loader, Select, TextInput } from '@mantine/core';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import {
  MOVEMENT_TYPES,
  REPORT_DOC_LABELS,
  REPORT_DOC_TYPES,
  REPORT_MOVEMENT_LABELS,
} from '@dax/inventory-contract';
import { BinPicker, ItemPicker } from '../../_lib/pickers';
import type { PickerOption } from '../../_lib/search-actions';

const MOVEMENT_OPTIONS = MOVEMENT_TYPES.map((m) => ({
  value: m,
  label: REPORT_MOVEMENT_LABELS[m],
}));
const DOC_OPTIONS = REPORT_DOC_TYPES.map((d) => ({
  value: d,
  label: REPORT_DOC_LABELS[d],
}));

const FIELD = { flex: '1 1 200px', maxWidth: 320 } as const;

export function MovementFilters({
  item,
  bin,
}: {
  item: PickerOption | null;
  bin: PickerOption | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function go(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete('page');
    const query = next.toString();
    startTransition(() =>
      router.push(query ? `${pathname}?${query}` : pathname),
    );
  }

  const filtered = [
    'from',
    'to',
    'itemId',
    'binId',
    'movement',
    'docType',
  ].some((k) => params.has(k));

  return (
    <div className="dax-filters" role="search">
      <TextInput
        type="date"
        label="From"
        value={params.get('from') ?? ''}
        max={params.get('to') ?? undefined}
        onChange={(e) => go({ from: e.currentTarget.value || null })}
        style={{ flex: '1 1 150px', maxWidth: 180 }}
      />
      <TextInput
        type="date"
        label="To"
        value={params.get('to') ?? ''}
        min={params.get('from') ?? undefined}
        onChange={(e) => go({ to: e.currentTarget.value || null })}
        style={{ flex: '1 1 150px', maxWidth: 180 }}
      />
      <ItemPicker
        label="Part"
        initial={item}
        value={params.get('itemId')}
        onChange={(v) => go({ itemId: v })}
        style={FIELD}
      />
      <BinPicker
        label="Bin"
        initial={bin}
        value={params.get('binId')}
        onChange={(v) => go({ binId: v })}
        style={FIELD}
      />
      <Select
        label="Movement"
        placeholder="All movements"
        data={MOVEMENT_OPTIONS}
        value={params.get('movement')}
        onChange={(v) => go({ movement: v })}
        clearable
        comboboxProps={{ withinPortal: true }}
        style={FIELD}
      />
      <Select
        label="Document"
        placeholder="All documents"
        data={DOC_OPTIONS}
        value={params.get('docType')}
        onChange={(v) => go({ docType: v })}
        clearable
        comboboxProps={{ withinPortal: true }}
        style={FIELD}
      />
      {pending ? <Loader size={18} /> : null}
      {filtered ? (
        <Button
          variant="subtle"
          onClick={() =>
            go({
              from: null,
              to: null,
              itemId: null,
              binId: null,
              movement: null,
              docType: null,
            })
          }
        >
          Clear filters
        </Button>
      ) : null}
    </div>
  );
}
