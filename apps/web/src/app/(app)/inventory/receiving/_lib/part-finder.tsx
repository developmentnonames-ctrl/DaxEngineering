'use client';

import {
  Alert,
  Button,
  Modal,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from '@mantine/core';
import { useDebouncedCallback, useMediaQuery } from '@mantine/hooks';
import { useRef, useState, useTransition } from 'react';
import { Icon, LinkList, Mono, Scanner } from '@dax/web-shell';
import { formatQty } from '../../../../../lib/format';
import { findParts, getPart, lookupPart } from './actions';
import type { PartLookup, PartRef } from './types';

function PartButton({
  part,
  onPick,
}: {
  part: Omit<PartRef, 'uom'> & { uom?: string };
  onPick: () => void;
}) {
  return (
    <UnstyledButton
      onClick={onPick}
      className="dax-inset"
      style={{ display: 'block', width: '100%', padding: '12px 16px' }}
    >
      <b>
        <Mono>{part.partNo}</Mono>
      </b>{' '}
      <span className="dax-muted">{part.brand}</span>
      <span className="dax-sub">
        {part.description}
        {part.free !== undefined ? (
          <>
            {' '}
            · Free <b>{formatQty(part.free)}</b> {part.uom ?? ''}
          </>
        ) : null}
      </span>
    </UnstyledButton>
  );
}

function SearchParts({ onPick }: { onPick: (part: PartRef) => void }) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState<PartRef[] | null>(null);
  const [pending, startTransition] = useTransition();
  const run = useDebouncedCallback((value: string) => {
    startTransition(async () => setFound(await findParts(value)));
  }, 300);

  return (
    <Stack gap="sm">
      <TextInput
        size="lg"
        type="search"
        label="Part number or description"
        placeholder="At least two characters"
        autoComplete="off"
        spellCheck={false}
        data-autofocus
        value={q}
        onChange={(e) => {
          setQ(e.currentTarget.value);
          run(e.currentTarget.value);
        }}
        leftSection={<Icon name="search" size={18} />}
      />
      {pending ? <Text c="dimmed">Searching…</Text> : null}
      {found && !pending && found.length === 0 && q.trim().length >= 2 ? (
        <Text c="dimmed">No active part matches.</Text>
      ) : null}
      {found?.map((part) => (
        <PartButton key={part.id} part={part} onPick={() => onPick(part)} />
      ))}
    </Stack>
  );
}

function ScanParts({ onPick }: { onPick: (part: PartRef) => void }) {
  const [pending, startTransition] = useTransition();
  const [last, setLast] = useState<{ code: string; result: PartLookup } | null>(
    null,
  );
  const busy = useRef(false);

  function handle(code: string) {
    if (busy.current) return;
    busy.current = true;
    startTransition(async () => {
      try {
        const result = await lookupPart(code);
        if (result.type === 'part') {
          setLast(null);
          onPick(result.part);
        } else setLast({ code, result });
      } finally {
        busy.current = false;
      }
    });
  }

  function choose(id: string) {
    startTransition(async () => {
      const part = await getPart(id);
      if (part) {
        setLast(null);
        onPick(part);
      }
    });
  }

  const result = last?.result;
  return (
    <Stack gap="sm">
      <Scanner onCode={handle} busy={pending} />
      {result?.type === 'none' ? (
        <Alert color="orange" title="Nothing found">
          No part matches <Mono>{last?.code}</Mono>. Try searching instead.
        </Alert>
      ) : null}
      {result?.type === 'error' ? (
        <Alert color="red">{result.message}</Alert>
      ) : null}
      {result?.type === 'choices' ? (
        <Stack gap="xs">
          <Text fw={600}>
            <Mono>{last?.code}</Mono> matches more than one part. Pick one:
          </Text>
          {result.parts.map((p) => (
            <PartButton key={p.id} part={p} onPick={() => choose(p.id)} />
          ))}
        </Stack>
      ) : null}
    </Stack>
  );
}

export function PartFinder({
  onPick,
  label = 'Add a line',
  title = 'Add a part',
  scanHint,
}: {
  onPick: (part: PartRef) => string | void;
  label?: string;
  title?: string;
  scanHint?: string;
}) {
  const [opened, setOpened] = useState(false);
  const [mode, setMode] = useState<'scan' | 'search'>('scan');
  const [notes, setNotes] = useState<{ key: string; text: string }[]>([]);
  const phone = useMediaQuery('(max-width: 48em)');

  function pick(part: PartRef) {
    const note = onPick(part) ?? `Added ${part.partNo}.`;
    setNotes((prev) => [
      { key: `${part.id}-${Date.now()}`, text: note },
      ...prev.slice(0, 4),
    ]);
    if (mode === 'search') setOpened(false);
  }

  return (
    <>
      <Button
        size="lg"
        variant="default"
        leftSection={<Icon name="plus" size={20} />}
        onClick={() => {
          setNotes([]);
          setOpened(true);
        }}
      >
        {label}
      </Button>
      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title={title}
        fullScreen={phone ?? false}
        size="lg"
      >
        <Stack gap="md">
          <SegmentedControl
            fullWidth
            size="md"
            value={mode}
            onChange={(v) => setMode(v === 'search' ? 'search' : 'scan')}
            data={[
              { value: 'scan', label: 'Scan' },
              { value: 'search', label: 'Search' },
            ]}
          />
          {mode === 'scan' ? (
            <ScanParts onPick={pick} />
          ) : (
            <SearchParts onPick={pick} />
          )}
          {notes.length ? (
            <LinkList
              items={notes.map((n, i) => ({
                key: n.key,
                title: (
                  <span style={{ display: 'inline-flex', gap: 8 }}>
                    <Icon name="check" size={18} />
                    {n.text}
                  </span>
                ),
                aside:
                  i === 0 ? <span className="dax-sub">Just now</span> : null,
              }))}
            />
          ) : null}
          {scanHint && mode === 'scan' ? (
            <Text size="sm" c="dimmed">
              {scanHint}
            </Text>
          ) : null}
          <Button size="lg" onClick={() => setOpened(false)}>
            Done
          </Button>
        </Stack>
      </Modal>
    </>
  );
}
