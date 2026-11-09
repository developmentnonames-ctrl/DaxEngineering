'use client';

import {
  Alert,
  Button,
  FileInput,
  Group,
  List,
  ListItem,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import { startTransition, useActionState, useState } from 'react';
import { Mono, Pill, SectionCard } from '@dax/web-shell';
import type { ImportKind, ImportState } from '../lib/import';
import { runImport } from '../lib/import-actions';
import { AppLink } from './links';

const IDLE: ImportState = { ok: false };

export function ImportScreen({
  kind,
  noun,
  columns,
  notes,
  backHref,
}: {
  kind: ImportKind;
  noun: string;
  columns: readonly string[];
  notes: string[];
  backHref: string;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [sentFile, setSentFile] = useState<File | null>(null);
  const [state, dispatch, pending] = useActionState(runImport, IDLE);
  const current = sentFile === file ? state : IDLE;
  const result = current.result;
  const ready = result?.dryRun === true && result.errors.length === 0;
  const done = result?.dryRun === false && result.errors.length === 0;

  function send(dryRun: boolean) {
    if (!file) return;
    const form = new FormData();
    form.set('kind', kind);
    form.set('file', file);
    form.set('dryRun', String(dryRun));
    setSentFile(file);
    startTransition(() => dispatch(form));
  }

  return (
    <Stack gap="lg">
      <SectionCard title="1. Get the template">
        <Stack gap="sm">
          <Text size="sm">
            Fill in one {noun} per row. Keep the first row of column names as it
            is.
          </Text>
          <div className="dax-chips" style={{ gap: 6 }}>
            {columns.map((c) => (
              <span key={c} className="dax-pill">
                <Mono>{c}</Mono>
              </span>
            ))}
          </div>
          {notes.length ? (
            <List size="sm" spacing={4}>
              {notes.map((n) => (
                <ListItem key={n}>{n}</ListItem>
              ))}
            </List>
          ) : null}
          <Group>
            <Button
              component="a"
              href={`/api/templates/${kind}`}
              variant="default"
              download
            >
              Download template
            </Button>
          </Group>
        </Stack>
      </SectionCard>

      <SectionCard title="2. Check your file">
        <Stack gap="sm">
          <Text size="sm">
            Nothing is saved yet. We read the file and list any rows that need
            fixing. Files can be up to 2 MB.
          </Text>
          <FileInput
            label="CSV file"
            placeholder="Choose a .csv file"
            accept=".csv,text/csv"
            value={file}
            onChange={setFile}
            clearable
            size="md"
          />
          <Group>
            <Button
              onClick={() => send(true)}
              disabled={!file || done}
              loading={pending && !ready}
            >
              Check file
            </Button>
          </Group>
          {current.error ? <Alert color="red">{current.error}</Alert> : null}
        </Stack>
      </SectionCard>

      {result ? (
        <SectionCard title="3. Import">
          <Stack gap="sm">
            {result.errors.length > 0 ? (
              <>
                <Alert color="red">
                  {result.errors.length}{' '}
                  {result.errors.length === 1 ? 'problem' : 'problems'} found in{' '}
                  {result.total} rows. Nothing was imported. Fix the file and
                  check it again.
                </Alert>
                <Table.ScrollContainer minWidth={420}>
                  <Table>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Row</Table.Th>
                        <Table.Th>Column</Table.Th>
                        <Table.Th>Problem</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {result.errors.map((e, i) => (
                        <Table.Tr key={`${e.row}-${e.field ?? ''}-${i}`}>
                          <Table.Td>{e.row}</Table.Td>
                          <Table.Td>
                            {e.field ? <Mono>{e.field}</Mono> : 'Whole row'}
                          </Table.Td>
                          <Table.Td>{e.message}</Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Table.ScrollContainer>
              </>
            ) : null}
            {ready ? (
              <>
                <Text size="sm">
                  <Pill tone="ok">Ready</Pill> All {result.total} rows look
                  good. Importing adds them all at once; if anything fails,
                  nothing is added.
                </Text>
                <Group>
                  <Button onClick={() => send(false)} loading={pending}>
                    Import {result.total} {result.total === 1 ? 'row' : 'rows'}
                  </Button>
                </Group>
              </>
            ) : null}
            {done ? (
              <Alert color="green">
                Imported {result.created}{' '}
                {result.created === 1 ? noun : `${noun}s`}.{' '}
                <AppLink href={backHref}>Back to the list</AppLink>
              </Alert>
            ) : null}
          </Stack>
        </SectionCard>
      ) : null}
    </Stack>
  );
}
