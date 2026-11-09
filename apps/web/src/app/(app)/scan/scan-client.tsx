'use client';

import { Alert, Stack, Text } from '@mantine/core';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { LinkList, Mono, Scanner } from '@dax/web-shell';
import { type ScanOutcome, scanCode } from './actions';

export function ScanClient({ notice }: { notice: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [last, setLast] = useState<{
    code: string;
    outcome: ScanOutcome;
  } | null>(null);
  const busy = useRef(false);

  function handle(code: string) {
    if (busy.current) return;
    busy.current = true;
    startTransition(async () => {
      try {
        const outcome = await scanCode(code);
        if (outcome.type === 'go') {
          router.push(outcome.path);
          return;
        }
        setLast({ code, outcome });
      } finally {
        busy.current = false;
      }
    });
  }

  const outcome = last?.outcome;
  return (
    <Stack gap="md">
      {notice && !last ? <Alert color="orange">{notice}</Alert> : null}
      <Scanner onCode={handle} busy={pending} />
      {outcome?.type === 'none' && last ? (
        <Alert color="orange" title="Nothing found">
          No item or bin matches <Mono>{last.code}</Mono>. Check the code, or
          search the item list.
        </Alert>
      ) : null}
      {outcome?.type === 'error' ? (
        <Alert color="red">{outcome.message}</Alert>
      ) : null}
      {outcome?.type === 'choices' ? (
        <Stack gap="xs">
          <Text fw={600}>
            <Mono>{last?.code}</Mono> matches more than one item. Pick one:
          </Text>
          <LinkList
            items={outcome.items.map((item) => ({
              key: item.path,
              href: item.path,
              title: (
                <>
                  <Mono>{item.partNo}</Mono>{' '}
                  <span className="dax-muted">{item.brand}</span>
                </>
              ),
              sub: item.description,
            }))}
          />
        </Stack>
      ) : null}
    </Stack>
  );
}
