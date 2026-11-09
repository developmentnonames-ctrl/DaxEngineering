'use client';

import {
  Alert,
  Button,
  Code,
  Stack,
  Table,
  Text,
  UnstyledButton,
} from '@mantine/core';
import { Empty, Mono, Pill, SectionCard } from '@dax/web-shell';
import { Fragment, useState, useTransition } from 'react';
import type { AuditEntry, AuditPage } from '@dax/platform-contract';
import { formatDateTime, humanizeAction } from '../../../lib/format';
import { loadMoreAudit } from './actions';
import type { AuditFilters } from './query';

function display(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
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
    <Stack gap="xs" py="xs" className="dax-inset">
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
          <Table fz="sm">
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
                    bg={changed.has(key) ? 'var(--dax-yel-soft)' : undefined}
                  >
                    <Table.Td>{fieldLabel(key)}</Table.Td>
                    <Table.Td>
                      {hidden ? (
                        <Text c="dimmed" size="sm">
                          Hidden
                        </Text>
                      ) : (
                        <Code ff="var(--dax-f-mono)">{display(before)}</Code>
                      )}
                    </Table.Td>
                    <Table.Td>
                      {hidden ? (
                        <Text c="dimmed" size="sm">
                          Hidden
                        </Text>
                      ) : (
                        <Code ff="var(--dax-f-mono)">{display(after)}</Code>
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

  if (!entries.length)
    return (
      <SectionCard title="Entries">
        <Empty title="No entries match">Try different filters.</Empty>
      </SectionCard>
    );

  return (
    <SectionCard
      flush
      title="Entries"
      note="Times are Sri Lanka time. Select a time to see what changed."
    >
      <Table.ScrollContainer minWidth={720}>
        <Table verticalSpacing="xs">
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
                        <Text size="sm" fw={600} c="var(--dax-int)">
                          {formatDateTime(entry.occurredAt)}
                        </Text>
                      </UnstyledButton>
                    </Table.Td>
                    <Table.Td>{entry.actorName ?? 'System'}</Table.Td>
                    <Table.Td>
                      <div
                        className="dax-chips"
                        style={{ gap: 4, alignItems: 'center' }}
                      >
                        {humanizeAction(entry.action)}
                        {entry.restricted ? (
                          <Pill tone="bad">Restricted</Pill>
                        ) : null}
                      </div>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">
                        {entityLabels[entry.entityKey] ?? entry.entityKey}
                      </Text>
                      {entry.entityId ? (
                        <span className="dax-sub">
                          <Mono>{entry.entityId}</Mono>
                        </span>
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
      {error || cursor ? (
        <div className="dax-card-body" style={{ paddingTop: 12 }}>
          <Stack gap="sm">
            {error ? <Alert color="red">{error}</Alert> : null}
            {cursor ? (
              <div className="dax-pager">
                <Button variant="default" onClick={loadMore} loading={pending}>
                  Load more
                </Button>
              </div>
            ) : null}
          </Stack>
        </div>
      ) : null}
    </SectionCard>
  );
}
