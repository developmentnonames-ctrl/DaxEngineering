'use client';

import { Select } from '@mantine/core';
import { RemotePicker } from '../../_lib/pickers';
import type { PickerOption } from '../../_lib/search-actions';
import { searchCustomers } from './actions';

export function DepartmentSelect({
  departments,
  value,
  onChange,
  error,
}: {
  departments: { id: string; name: string }[];
  value: string | null;
  onChange: (value: string | null) => void;
  error?: string;
}) {
  return (
    <Select
      label="Requesting department"
      required
      data={departments.map((d) => ({ value: d.id, label: d.name }))}
      value={value}
      onChange={onChange}
      allowDeselect={false}
      searchable={departments.length > 8}
      nothingFoundMessage="No departments to choose from"
      comboboxProps={{ withinPortal: true }}
      error={error}
      size="md"
    />
  );
}

export function CustomerPicker({
  initial,
  value,
  onChange,
  error,
}: {
  initial: PickerOption | null;
  value: string | null;
  onChange: (value: string | null) => void;
  error?: string;
}) {
  return (
    <RemotePicker
      label="Customer"
      description="Optional"
      search={searchCustomers}
      initial={initial}
      value={value}
      onChange={onChange}
      placeholder="Type a customer name"
      error={error}
      size="md"
    />
  );
}
