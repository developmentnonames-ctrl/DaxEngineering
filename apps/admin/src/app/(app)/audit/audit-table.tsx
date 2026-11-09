'use client';

import {
  Alert,
  Badge,
  Button,
  Code,
  Group,
  Stack,
  Table,
  Text,
  UnstyledButton,
} from '@mantine/core';
import { Fragment, useState, useTransition } from 'react';
import type { AuditEntry, AuditPage } from '@dax/platform-contract';
import { formatDateTime } from '../../../lib/format';
import { loadMoreAudit } from './actions';
import type { AuditFilters } from './query';

function display(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function humanize(action: string): string {
  const words = action.replace(/[._-]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function diffKeys(entry: AuditEntry): string[] {
  const keys = new Set(entry.changedFields);
  for (const k of Object.keys(entry.before ?? {})) keys.add(k);
  for (const k of Object.keys(entry.after ?? {})) keys.add(k);
  return [...keys];
}

function EntryDiff({
  entry,
  fieldLabel,
}: {
  entry: AuditEntry;
  fieldLabel: (name: string) => string;
}) {
  const keys = diffKeys(entry);
  const changed = new Set(entry.changedFields);
  return (
    <Stack gap="xs" py="xs">
      {entry.reason ? (
        <Text size="sm">
          <Text span fw={600}>
            Reason:
          </Text>{' '}
          {entry.reason}
        </Text>
      ) : null}
      {entry.restricted ? (
        <Text size="xs" c="dimmed">
          This change touched restricted data. Values you can&apos;t see are
          left out.
        </Text>
      ) : null}
      {keys.length ? (
        <Table.ScrollContainer minWidth={480}>
          <Table withTableBorder fz="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Field</Table.Th>
                <Table.Th>Before</Table.Th>
                <Table.Th>After</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {keys.map((key) => {
                const before = entry.before?.[key];
                const after = entry.after?.[key];
                const hidden =
                  !(entry.before && key in entry.before) &&
                  !(entry.after && key in entry.after);
                return (
                  <Table.Tr
                    key={key}
                    bg={
                      changed.has(key)
                        ? 'var(--mantine-color-yellow-light)'
                        : undefined
                    }
                  >
                    <Table.Td>{fieldLabel(key)}</Table.Td>
                    <Table.Td>
                      {hidden ? (
                        <Text c="dimmed" size="sm">
                          Hidden
                        </Text>
                      ) : (
                        <Code>{display(before)}</Code>
                      )}
                    </Table.Td>
                    <Table.Td>
                      {hidden ? (
                        <Text c="dimmed" size="sm">
                          Hidden
                        </Text>
                      ) : (
                        <Code>{display(after)}</Code>
                      )}
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      ) : (
        <Text size="sm" c="dimmed">
          No field details for this entry.
        </Text>
      )}
    </Stack>
  );
}

export function AuditTable({
  filters,
  initial,
  entityLabels,
  fieldLabels,
}: {
  filters: AuditFilters;
  initial: AuditPage;
  entityLabels: Record<string, string>;
  fieldLabels: Record<string, string>;
}) {
  const [entries, setEntries] = useState(initial.entries);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const loadMore = () => {
    if (!cursor) return;
    startTransition(async () => {
      const result = await loadMoreAudit({ filters, cursor });
      if (!result.page) {
        setError(result.error ?? 'Could not load more.');
        return;
      }
      const next = result.page;
      setError(null);
      setEntries((prev) => [...prev, ...next.entries]);
      setCursor(next.nextCursor);
    });
  };

  if (!entries.length) return <Text c="dimmed">No entries match.</Text>;

  return (
    <Stack>
      <Table.ScrollContainer minWidth={720}>
        <Table striped withTableBorder verticalSpacing="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Time</Table.Th>
              <Table.Th>User</Table.Th>
              <Table.Th>Action</Table.Th>
              <Table.Th>Record</Table.Th>
              <Table.Th>Changed</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {entries.map((entry) => {
              const expanded = open === entry.id;
              const fieldLabel = (name: string) =>
                fieldLabels[`${entry.entityKey}.${name}`] ?? name;
              return (
                <Fragment key={entry.id}>
                  <Table.Tr>
                    <Table.Td style={{ whiteSpace: 'nowrap' }}>
                      <UnstyledButton
                        onClick={() => setOpen(expanded ? null : entry.id)}
                        aria-expanded={expanded}
                      >
                        <Text size="sm" c="blue">
                          {formatDateTime(entry.occurredAt)}
                        </Text>
                      </UnstyledButton>
                    </Table.Td>
                    <Table.Td>{entry.actorName ?? 'System'}</Table.Td>
                    <Table.Td>
                      <Group gap={4}>
                        {humanize(entry.action)}
                        {entry.restricted ? (
                          <Badge size="xs" color="red" variant="light">
                            Restricted
                          </Badge>
                        ) : null}
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">
                        {entityLabels[entry.entityKey] ?? entry.entityKey}
                      </Text>
                      {entry.entityId ? (
                        <Text size="xs" c="dimmed" ff="monospace">
                          {entry.entityId}
                        </Text>
                      ) : null}
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" lineClamp={2}>
                        {entry.changedFields.map(fieldLabel).join(', ') || '—'}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                  {expanded ? (
                    <Table.Tr>
                      <Table.Td colSpan={5}>
                        <EntryDiff entry={entry} fieldLabel={fieldLabel} />
                      </Table.Td>
                    </Table.Tr>
                  ) : null}
                </Fragment>
              );
            })}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      <Text size="xs" c="dimmed">
        Times are Sri Lanka time. Select a time to see what changed.
      </Text>
      {error ? <Alert color="red">{error}</Alert> : null}
      {cursor ? (
        <Group>
          <Button variant="default" onClick={loadMore} loading={pending}>
            Load more
          </Button>
        </Group>
      ) : null}
    </Stack>
  );
}
