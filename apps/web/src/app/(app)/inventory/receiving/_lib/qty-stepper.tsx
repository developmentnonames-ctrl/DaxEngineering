'use client';

import { ActionIcon, TextInput } from '@mantine/core';
import { Icon } from '@dax/web-shell';
import { qtyNumber, qtyText } from './lines';

export function QtyStepper({
  label,
  value,
  onChange,
  unit,
  error,
  max,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  unit?: string;
  error?: string;
  max?: number;
  disabled?: boolean;
}) {
  const n = qtyNumber(value);
  const step = (delta: number) => {
    const next = Math.max(0, n + delta);
    onChange(qtyText(max === undefined ? next : Math.min(max, next)));
  };
  return (
    <div className="dax-stepper" role="group" aria-label={label}>
      <span>
        {label}
        {unit ? ` (${unit})` : ''}
      </span>
      <div>
        <ActionIcon
          size={52}
          radius="xl"
          variant="default"
          aria-label={`One less ${label.toLowerCase()}`}
          disabled={disabled || n <= 0}
          onClick={() => step(-1)}
        >
          <Icon name="minus" size={22} />
        </ActionIcon>
        <TextInput
          size="lg"
          inputMode="decimal"
          autoComplete="off"
          aria-label={label}
          value={value}
          disabled={disabled}
          error={error}
          onChange={(e) => onChange(e.currentTarget.value.replace(',', '.'))}
          onFocus={(e) => e.currentTarget.select()}
        />
        <ActionIcon
          size={52}
          radius="xl"
          variant="default"
          aria-label={`One more ${label.toLowerCase()}`}
          disabled={disabled || (max !== undefined && n >= max)}
          onClick={() => step(1)}
        >
          <Icon name="plus" size={22} />
        </ActionIcon>
      </div>
    </div>
  );
}
