'use client';

import { ActionIcon, Group, Stack, Text, TextInput } from '@mantine/core';
import { Empty, Icon, Mono, Pill } from '@dax/web-shell';
import { formatQty } from '../../../../../lib/format';
import { qtyNumber, qtyText } from '../../receiving/_lib/lines';
import { PartFinder } from '../../receiving/_lib/part-finder';
import { QtyStepper } from '../../receiving/_lib/qty-stepper';
import type { PartRef } from '../../receiving/_lib/types';

export interface RequestLine {
  key: string;
  id?: string;
  part: PartRef;
  qty: string;
  notes: string;
}

function FreeHint({ line }: { line: RequestLine }) {
  if (line.part.free === undefined) return null;
  const free = qtyNumber(line.part.free);
  const want = qtyNumber(line.qty);
  if (free <= 0)
    return <Pill tone="bad">None free now · the request will wait</Pill>;
  if (want > free)
    return (
      <Pill tone="yel">
        Only {formatQty(line.part.free)} free · the rest will wait
      </Pill>
    );
  return <Pill tone="ok">{formatQty(line.part.free)} free</Pill>;
}

export function RequestLines({
  lines,
  onChange,
  errors,
  withNotes = false,
  title = 'Parts',
}: {
  lines: RequestLine[];
  onChange: (lines: RequestLine[]) => void;
  errors: (key: string) => string | undefined;
  withNotes?: boolean;
  title?: string;
}) {
  function addPart(part: PartRef): string {
    const existing = lines.find((l) => l.part.id === part.id);
    if (existing) {
      onChange(
        lines.map((l) =>
          l.key === existing.key
            ? { ...l, qty: qtyText(qtyNumber(l.qty) + 1) }
            : l,
        ),
      );
      return `One more ${part.partNo}.`;
    }
    onChange([
      ...lines,
      { key: `${part.id}-${Date.now()}`, part, qty: '1', notes: '' },
    ]);
    return `Added ${part.partNo}.`;
  }

  const patch = (key: string, change: Partial<RequestLine>) =>
    onChange(lines.map((l) => (l.key === key ? { ...l, ...change } : l)));

  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Text fw={700} size="lg">
          {title}
        </Text>
        <Text c="dimmed" size="sm">
          {lines.length} {lines.length === 1 ? 'line' : 'lines'}
        </Text>
      </Group>
      {lines.length === 0 ? (
        <Empty title="No parts yet">Scan or search for each part needed.</Empty>
      ) : (
        lines.map((line, i) => (
          <div key={line.key} className="dax-line">
            <div className="dax-line-top">
              <div style={{ minWidth: 0 }}>
                <span className="p">
                  <Mono>{line.part.partNo}</Mono>
                </span>{' '}
                <span className="dax-muted">{line.part.brand}</span>
                <span className="dax-sub">{line.part.description}</span>
              </div>
              <ActionIcon
                size="lg"
                variant="subtle"
                color="red"
                aria-label={`Remove ${line.part.partNo}`}
                onClick={() =>
                  onChange(lines.filter((l) => l.key !== line.key))
                }
              >
                <Icon name="close" size={20} />
              </ActionIcon>
            </div>
            <div className="dax-steppers">
              <QtyStepper
                label="Quantity"
                unit={line.part.uom}
                value={line.qty}
                error={errors(`lines.${i}.qty`)}
                onChange={(qty) => patch(line.key, { qty })}
              />
            </div>
            {withNotes ? (
              <TextInput
                size="md"
                placeholder="Notes (optional)"
                aria-label={`Notes for ${line.part.partNo}`}
                maxLength={300}
                value={line.notes}
                error={errors(`lines.${i}.notes`)}
                onChange={(e) =>
                  patch(line.key, { notes: e.currentTarget.value })
                }
              />
            ) : null}
            <div className="dax-chips" style={{ gap: 6 }}>
              <FreeHint line={line} />
            </div>
          </div>
        ))
      )}
      {errors('lines') ? (
        <Text c="red" size="sm">
          Add at least one part.
        </Text>
      ) : null}
      <Group>
        <PartFinder
          onPick={addPart}
          title="Add a part"
          scanHint="Keep scanning. A part already listed gets one more."
        />
      </Group>
    </Stack>
  );
}
