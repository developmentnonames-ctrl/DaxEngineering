'use client';

import {
  ActionIcon,
  Alert,
  Button,
  Group,
  List,
  ListItem,
  Modal,
  Stack,
  Text,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import Link from 'next/link';
import {
  startTransition,
  useActionState,
  useRef,
  useState,
  useTransition,
} from 'react';
import type { PutawayRow } from '@dax/inventory-contract';
import { Empty, Icon, Mono, Pill, Scanner, SectionCard } from '@dax/web-shell';
import { StateAlert } from '../../../../../components/state-alert';
import { type ActionState, IDLE } from '../../../../../lib/action-state';
import { formatDateTime, formatQty } from '../../../../../lib/format';
import { RemotePicker } from '../../_lib/pickers';
import { type PickerOption, searchBins } from '../../_lib/search-actions';
import { lookupBin, putAway } from '../_lib/actions';
import { grnPath } from '../_lib/labels';
import { isQty, qtyNumber, qtyText, round3 } from '../_lib/lines';
import { QtyStepper } from '../_lib/qty-stepper';
import type { BinRef } from '../_lib/types';

export interface PutawayGroup {
  grn: { id: string; number: string };
  postedAt: string;
  rows: PutawayRow[];
}

interface Split {
  key: string;
  bin: BinRef | null;
  qty: string;
}

type Moves = Parameters<typeof putAway>[1];

function usePutAway(onDone: () => void) {
  return useActionState(async (prev: ActionState, payload: Moves) => {
    const result = await putAway(prev, payload);
    if (result.ok) onDone();
    return result;
  }, IDLE);
}

function BinChooser({ onChoose }: { onChoose: (bin: BinRef) => void }) {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startLookup] = useTransition();
  const labels = useRef(new Map<string, string>());
  const busy = useRef(false);

  async function search(q: string): Promise<PickerOption[]> {
    const found = await searchBins(q);
    for (const o of found) labels.current.set(o.value, o.label);
    return found;
  }

  function handle(code: string) {
    if (busy.current) return;
    busy.current = true;
    startLookup(async () => {
      try {
        const result = await lookupBin(code);
        if (result.type === 'bin') {
          setError(null);
          setScanning(false);
          onChoose(result.bin);
        } else if (result.type === 'none') {
          setError('No bin matches that label.');
        } else setError(result.message);
      } finally {
        busy.current = false;
      }
    });
  }

  return (
    <Stack gap="sm">
      {scanning ? (
        <Scanner onCode={handle} busy={pending} />
      ) : (
        <Button
          size="lg"
          leftSection={<Icon name="scan" size={20} />}
          onClick={() => setScanning(true)}
        >
          Scan the bin label
        </Button>
      )}
      <RemotePicker
        label="Or pick the bin"
        search={search}
        initial={null}
        value={null}
        onChange={(value) => {
          const code = value ? labels.current.get(value) : undefined;
          if (value && code) onChoose({ id: value, code });
        }}
        placeholder="Type a bin code"
        size="lg"
      />
      {error ? <Alert color="orange">{error}</Alert> : null}
    </Stack>
  );
}

function PutawayFlow({
  row,
  onClose,
}: {
  row: PutawayRow;
  onClose: () => void;
}) {
  const waiting = qtyNumber(row.toPutAway);
  const [splits, setSplits] = useState<Split[]>([
    { key: 'first', bin: row.defaultBin, qty: qtyText(waiting) },
  ]);
  const [state, dispatch, pending] = usePutAway(onClose);
  const total = round3(splits.reduce((sum, s) => sum + qtyNumber(s.qty), 0));
  const left = round3(waiting - total);
  const ready =
    splits.every((s) => s.bin && isQty(s.qty) && qtyNumber(s.qty) > 0) &&
    total <= waiting &&
    total > 0;

  function patch(key: string, change: Partial<Split>) {
    setSplits((prev) =>
      prev.map((s) => (s.key === key ? { ...s, ...change } : s)),
    );
  }

  function confirm() {
    const moves = splits.flatMap((s) =>
      s.bin ? [{ grnLineId: row.grnLineId, binId: s.bin.id, qty: s.qty }] : [],
    );
    startTransition(() => dispatch({ moves }));
  }

  return (
    <Stack gap="md">
      <div>
        <Text size="lg" fw={700}>
          <Mono>{row.item.partNo}</Mono>{' '}
          <span className="dax-muted">{row.item.brand}</span>
        </Text>
        <Text size="sm">{row.item.description}</Text>
        <Text size="sm" c="dimmed">
          {formatQty(row.toPutAway)} {row.item.uom} waiting in the receiving bin
          · GRN <Mono>{row.grn.number}</Mono>
        </Text>
      </div>
      {splits.map((split, i) => (
        <div key={split.key} className="dax-line">
          <div className="dax-line-top">
            <Text fw={600}>
              {splits.length > 1 ? `Bin ${i + 1}` : 'Target bin'}
            </Text>
            {splits.length > 1 ? (
              <ActionIcon
                size="lg"
                variant="subtle"
                color="red"
                aria-label="Remove this bin"
                onClick={() =>
                  setSplits((prev) => prev.filter((s) => s.key !== split.key))
                }
              >
                <Icon name="close" size={20} />
              </ActionIcon>
            ) : null}
          </div>
          {split.bin ? (
            <Group justify="space-between" wrap="nowrap">
              <span className="dax-zone" style={{ fontSize: 18 }}>
                {split.bin.code}
              </span>
              <Button
                variant="default"
                onClick={() => patch(split.key, { bin: null })}
              >
                Change bin
              </Button>
            </Group>
          ) : (
            <BinChooser onChoose={(bin) => patch(split.key, { bin })} />
          )}
          {split.bin && row.defaultBin?.id === split.bin.id ? (
            <span className="dax-sub">The part&apos;s usual bin.</span>
          ) : null}
          <QtyStepper
            label="Quantity"
            unit={row.item.uom}
            value={split.qty}
            max={waiting}
            error={
              isQty(split.qty) && qtyNumber(split.qty) > 0
                ? undefined
                : 'Enter more than 0'
            }
            onChange={(qty) => patch(split.key, { qty })}
          />
        </div>
      ))}
      {left < 0 ? (
        <Alert color="red">
          That is {formatQty(String(-left))} more than is waiting.
        </Alert>
      ) : null}
      {left > 0 ? (
        <Button
          variant="default"
          size="lg"
          leftSection={<Icon name="plus" size={20} />}
          onClick={() =>
            setSplits((prev) => [
              ...prev,
              { key: `split-${Date.now()}`, bin: null, qty: qtyText(left) },
            ])
          }
        >
          Put the other {formatQty(String(left))} in another bin
        </Button>
      ) : null}
      <StateAlert state={state} />
      <Button size="lg" disabled={!ready} loading={pending} onClick={confirm}>
        Put away {formatQty(String(total))} {row.item.uom}
      </Button>
    </Stack>
  );
}

function BulkButton({ rows }: { rows: PutawayRow[] }) {
  const [opened, setOpened] = useState(false);
  const [state, dispatch, pending] = usePutAway(() => setOpened(false));
  const ready = rows.filter((r) => r.defaultBin);
  if (ready.length === 0) return null;
  return (
    <>
      <Button size="md" onClick={() => setOpened(true)}>
        Put all to usual bins ({ready.length})
      </Button>
      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title="Put all to their usual bins?"
        centered
      >
        <Stack>
          <Text size="sm">
            Everything waiting on these lines moves to the part&apos;s usual bin
            and becomes free stock. Lines without a usual bin stay here.
          </Text>
          <List size="sm" spacing={4}>
            {ready.slice(0, 12).map((r) => (
              <ListItem key={r.grnLineId}>
                <Mono>{r.item.partNo}</Mono> · {formatQty(r.toPutAway)}{' '}
                {r.item.uom} to <Mono>{r.defaultBin?.code}</Mono>
              </ListItem>
            ))}
            {ready.length > 12 ? (
              <ListItem>and {ready.length - 12} more</ListItem>
            ) : null}
          </List>
          {state.error ? <Alert color="red">{state.error}</Alert> : null}
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setOpened(false)}>
              Not now
            </Button>
            <Button
              loading={pending}
              onClick={() =>
                startTransition(() =>
                  dispatch({
                    moves: ready.flatMap((r) =>
                      r.defaultBin
                        ? [
                            {
                              grnLineId: r.grnLineId,
                              binId: r.defaultBin.id,
                              qty: r.toPutAway,
                            },
                          ]
                        : [],
                    ),
                  }),
                )
              }
            >
              Put all away
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}

export function PutawayBoard({
  groups,
  canAct,
}: {
  groups: PutawayGroup[];
  canAct: boolean;
}) {
  const [open, setOpen] = useState<PutawayRow | null>(null);
  const phone = useMediaQuery('(max-width: 48em)');
  const rows = groups.flatMap((g) => g.rows);

  if (groups.length === 0)
    return (
      <SectionCard>
        <Empty title="Nothing waiting">
          Everything received has been put away.
        </Empty>
      </SectionCard>
    );

  return (
    <>
      {canAct ? (
        <Group justify="flex-end">
          <BulkButton rows={rows.slice(0, 300)} />
        </Group>
      ) : null}
      {groups.map((group) => (
        <SectionCard
          key={group.grn.id}
          title={
            <Link href={grnPath(group.grn.id)} className="dax-link">
              <Mono>{group.grn.number}</Mono>
            </Link>
          }
          note={`Posted ${formatDateTime(group.postedAt)}`}
        >
          <Stack gap="sm">
            {group.rows.map((row) => (
              <div key={row.grnLineId} className="dax-line">
                <div className="dax-line-top">
                  <div style={{ minWidth: 0 }}>
                    <span className="p">
                      <Mono>{row.item.partNo}</Mono>
                    </span>{' '}
                    <span className="dax-muted">{row.item.brand}</span>
                    <span className="dax-sub">{row.item.description}</span>
                  </div>
                  <b style={{ fontSize: 20, whiteSpace: 'nowrap' }}>
                    {formatQty(row.toPutAway)}{' '}
                    <small className="dax-muted">{row.item.uom}</small>
                  </b>
                </div>
                <Group justify="space-between" gap="sm">
                  {row.defaultBin ? (
                    <Pill tone="int">
                      Usual bin <Mono>{row.defaultBin.code}</Mono>
                    </Pill>
                  ) : (
                    <Pill>No usual bin</Pill>
                  )}
                  {canAct ? (
                    <Button size="md" onClick={() => setOpen(row)}>
                      Put away
                    </Button>
                  ) : null}
                </Group>
              </div>
            ))}
          </Stack>
        </SectionCard>
      ))}
      <Modal
        opened={open !== null}
        onClose={() => setOpen(null)}
        title="Put away"
        fullScreen={phone ?? false}
        size="lg"
      >
        {open ? (
          <PutawayFlow
            key={open.grnLineId}
            row={open}
            onClose={() => setOpen(null)}
          />
        ) : null}
      </Modal>
    </>
  );
}
