'use client';

import {
  Button,
  NumberInput,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { startTransition, useActionState, useState } from 'react';
import type { NumberSeriesDto } from '@dax/platform-contract';
import { Empty, Mono, Pill, SectionCard } from '@dax/web-shell';
import { fieldError, IDLE } from '../../../lib/action-state';
import { saveSeries } from './actions';

function SeriesRow({
  series,
  canManage,
}: {
  series: NumberSeriesDto;
  canManage: boolean;
}) {
  const [state, dispatch, pending] = useActionState(saveSeries, IDLE);
  const [pattern, setPattern] = useState(series.pattern);
  const [padding, setPadding] = useState(series.padding);
  const [active, setActive] = useState(series.active);
  const dirty =
    pattern !== series.pattern ||
    padding !== series.padding ||
    active !== series.active;

  return (
    <Table.Tr>
      <Table.Td>
        <Text size="sm" fw={500}>
          {series.name}
        </Text>
        <Text size="xs" c="dimmed">
          <Mono>
            {series.docType}
            {series.subtype ? ` · ${series.subtype}` : ''}
          </Mono>
        </Text>
      </Table.Td>
      <Table.Td>
        {canManage ? (
          <TextInput
            aria-label="Pattern"
            value={pattern}
            onChange={(e) => setPattern(e.currentTarget.value)}
            maxLength={60}
            disabled={pending}
            error={fieldError(state, 'input.pattern')}
            styles={{ input: { fontFamily: 'var(--dax-f-mono)' } }}
          />
        ) : (
          <Mono>{series.pattern}</Mono>
        )}
      </Table.Td>
      <Table.Td w={110}>
        {canManage ? (
          <NumberInput
            aria-label="Padding"
            value={padding}
            onChange={(v) =>
              setPadding(typeof v === 'number' ? v : series.padding)
            }
            min={1}
            max={8}
            clampBehavior="strict"
            allowDecimal={false}
            disabled={pending}
            error={fieldError(state, 'input.padding')}
          />
        ) : (
          series.padding
        )}
      </Table.Td>
      <Table.Td>
        {canManage ? (
          <Switch
            aria-label="Active"
            checked={active}
            disabled={pending}
            onChange={(e) => setActive(e.currentTarget.checked)}
          />
        ) : (
          <Pill tone={series.active ? 'ok' : undefined}>
            {series.active ? 'Active' : 'Off'}
          </Pill>
        )}
      </Table.Td>
      <Table.Td>
        <Stack gap={2}>
          <Mono>{series.preview}</Mono>
          {dirty ? (
            <Text size="xs" c="dimmed">
              Save to update the preview
            </Text>
          ) : null}
        </Stack>
      </Table.Td>
      {canManage ? (
        <Table.Td>
          <Stack gap={4} align="flex-start">
            <Button
              size="xs"
              disabled={!dirty}
              loading={pending}
              onClick={() =>
                startTransition(() =>
                  dispatch({
                    id: series.id,
                    input: { pattern, padding, active },
                  }),
                )
              }
            >
              Save
            </Button>
            {state.error ? (
              <Text size="xs" c="red">
                {state.error}
              </Text>
            ) : null}
          </Stack>
        </Table.Td>
      ) : null}
    </Table.Tr>
  );
}

export function SeriesTable({
  series,
  canManage,
}: {
  series: NumberSeriesDto[];
  canManage: boolean;
}) {
  if (!series.length)
    return (
      <SectionCard title="Number series">
        <Empty title="No document types use numbering yet" />
      </SectionCard>
    );
  return (
    <SectionCard
      flush
      title="Number series"
      note={`${series.length} document ${series.length === 1 ? 'type' : 'types'}`}
    >
      <Table.ScrollContainer minWidth={760}>
        <Table verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Document</Table.Th>
              <Table.Th>Pattern</Table.Th>
              <Table.Th>Digits</Table.Th>
              <Table.Th>Active</Table.Th>
              <Table.Th>Next number looks like</Table.Th>
              {canManage ? <Table.Th /> : null}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {series.map((s) => (
              <SeriesRow
                key={`${s.id}:${s.pattern}:${String(s.padding)}:${String(s.active)}`}
                series={s}
                canManage={canManage}
              />
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </SectionCard>
  );
}
