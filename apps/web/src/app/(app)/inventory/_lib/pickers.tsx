'use client';

import { Select, type SelectProps } from '@mantine/core';
import { useDebouncedCallback } from '@mantine/hooks';
import { useState, useTransition } from 'react';
import { type PickerOption, searchBins, searchItems } from './search-actions';

function RemotePicker({
  search,
  initial,
  value,
  onChange,
  ...props
}: Omit<SelectProps, 'data' | 'value' | 'onChange'> & {
  search: (q: string) => Promise<PickerOption[]>;
  initial: PickerOption | null;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const [options, setOptions] = useState<PickerOption[]>(
    initial ? [initial] : [],
  );
  const [selected, setSelected] = useState<PickerOption | null>(initial);
  const [pending, startTransition] = useTransition();

  const run = useDebouncedCallback((q: string) => {
    startTransition(async () => {
      const found = await search(q);
      setOptions(found);
    });
  }, 300);

  const data =
    selected && !options.some((o) => o.value === selected.value)
      ? [selected, ...options]
      : options;

  return (
    <Select
      {...props}
      data={data}
      value={value}
      searchable
      clearable
      filter={({ options: all }) => all}
      nothingFoundMessage={pending ? 'Searching…' : 'Type to search'}
      onDropdownOpen={() => {
        if (options.length <= 1) run('');
      }}
      onSearchChange={(q) => {
        if (q && q !== selected?.label) run(q);
      }}
      onChange={(v, option) => {
        setSelected(
          option ? { value: option.value, label: option.label } : null,
        );
        onChange(v);
      }}
      comboboxProps={{ withinPortal: true }}
    />
  );
}

export function ItemPicker({
  excludeId,
  ...props
}: Omit<SelectProps, 'data' | 'value' | 'onChange'> & {
  excludeId?: string;
  initial: PickerOption | null;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  return (
    <RemotePicker
      {...props}
      search={(q) => searchItems(q, excludeId)}
      placeholder="Type a part number or description"
    />
  );
}

export function BinPicker(
  props: Omit<SelectProps, 'data' | 'value' | 'onChange'> & {
    initial: PickerOption | null;
    value: string | null;
    onChange: (value: string | null) => void;
  },
) {
  return (
    <RemotePicker
      {...props}
      search={searchBins}
      placeholder="Type a bin code"
    />
  );
}
