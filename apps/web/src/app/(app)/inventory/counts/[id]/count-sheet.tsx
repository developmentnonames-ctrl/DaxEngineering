'use client';

import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from '@mantine/core';
import {
  startTransition,
  useActionState,
  useRef,
  useState,
  useTransition,
} from 'react';
import type { CountBinDto, CountDto } from '@dax/inventory-contract';
import { Icon, Mono, Pill, Scanner, SectionCard } from '@dax/web-shell';
import { ConfirmAction } from '../../../../../components/confirm-action';
import { StateAlert } from '../../../../../components/state-alert';
import { IDLE } from '../../../../../lib/action-state';
import { formatQty } from '../../../../../lib/format';
import { lookupBin } from '../../receiving/_lib/actions';
import { isQty, qtyNumber, round3 } from '../../receiving/_lib/lines';
import { PartFinder } from '../../receiving/_lib/part-finder';
import { QtyStepper } from '../../receiving/_lib/qty-stepper';
import type { PartRef } from '../../receiving/_lib/types';
import { countStep, removeCountLine, saveBinCounts } from '../_lib/actions';

type Save = Parameters<typeof saveBinCounts>[1];

interface Found {
  part: PartRef;
  qty: string;
}

function signed(n: number): string {
  return n > 0 ? `+${formatQty(String(n))}` : formatQty(String(n));
}

function BinScan({
  bins,
  onPick,
}: {
  bins: CountBinDto[];
  onPick: (id: string) => void;
}) {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startLookup] = useTransition();
  const busy = useRef(false);

  function handle(code: string) {
    if (busy.current) return;
    busy.current = true;
    startLookup(async () => {
      try {
        const result = await lookupBin(code);
        if (result.type === 'bin') {
          if (bins.some((b) => b.id === result.bin.id)) {
            setError(null);
            setScanning(false);
            onPick(result.bin.id);
          } else {
            setError(`Bin ${result.bin.code} is not part of this count.`);
          }
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
          Scan a bin label
        </Button>
      )}
      {error ? <Alert color="orange">{error}</Alert> : null}
    </Stack>
  );
}

function BinCounter({
  count,
  bin,
  save,
  saving,
  onBack,
}: {
  count: CountDto;
  bin: CountBinDto;
  save: (payload: Save) => void;
  saving: boolean;
  onBack: () => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(bin.lines.map((l) => [l.id, l.countedQty ?? ''])),
  );
  const [found, setFound] = useState<Found[]>([]);
  const changed = bin.lines.filter(
    (l) => (drafts[l.id] ?? '').trim() !== (l.countedQty ?? ''),
  );
  const invalid =
    changed.some((l) => {
      const v = (drafts[l.id] ?? '').trim();
      return v !== '' && !isQty(v);
    }) || found.some((f) => !isQty(f.qty));
  const dirty = changed.length > 0 || found.length > 0;

  function pick(part: PartRef): string {
    if (
      bin.lines.some((l) => l.item.id === part.id) ||
      found.some((f) => f.part.id === part.id)
    ) {
      return `${part.partNo} is already on the sheet for this bin.`;
    }
    setFound((prev) => [...prev, { part, qty: '1' }]);
    return `Added ${part.partNo}. Enter how many are here.`;
  }

  function submit() {
    save({
      id: count.id,
      version: count.version,
      lines: changed.map((l) => {
        const v = (drafts[l.id] ?? '').trim();
        return { lineId: l.id, countedQty: v === '' ? null : v };
      }),
      found: found.map((f) => ({
        binId: bin.id,
        itemId: f.part.id,
        countedQty: f.qty.trim(),
      })),
    });
  }

  function back() {
    if (dirty && !window.confirm('Leave this bin without saving its counts?'))
      return;
    onBack();
  }

  return (
    <Stack gap="md">
      <Group justify="space-between" wrap="nowrap">
        <span className="dax-zone" style={{ fontSize: 20 }}>
          {bin.code}
        </span>
        <Button
          variant="default"
          leftSection={<Icon name="back" size={18} />}
          onClick={back}
        >
          All bins
        </Button>
      </Group>
      {bin.lines.length === 0 && found.length === 0 ? (
        <Text c="dimmed">
          The system shows nothing in this bin. If you find parts here, add them
          below.
        </Text>
      ) : null}
      {bin.lines.map((line) => {
        const draft = drafts[line.id] ?? '';
        const diff =
          line.systemQty !== undefined && draft.trim() !== '' && isQty(draft)
            ? round3(qtyNumber(draft) - qtyNumber(line.systemQty))
            : null;
        return (
          <div key={line.id} className="dax-line">
            <div className="dax-line-top">
              <div style={{ minWidth: 0 }}>
                <span className="p">
                  <Mono>{line.item.partNo}</Mono>
                </span>{' '}
                <span className="dax-muted">{line.item.brand}</span>
                <span className="dax-sub">{line.item.description}</span>
                {line.systemQty !== undefined ? (
                  <span className="dax-sub">
                    System {formatQty(line.systemQty)} {line.item.uom}
                    {diff !== null && diff !== 0 ? (
                      <>
                        {' '}
                        · <b>{signed(diff)}</b>
                      </>
                    ) : null}
                  </span>
                ) : null}
              </div>
              {line.added ? (
                <ConfirmAction
                  action={removeCountLine}
                  payload={{
                    id: count.id,
                    version: count.version,
                    lineId: line.id,
                  }}
                  label="Remove"
                  title={`Remove ${line.item.partNo}?`}
                  message="It was added as found in this bin. Remove it only if it was added by mistake."
                  confirmLabel="Remove"
                  color="red"
                />
              ) : null}
            </div>
            {line.added ? <Pill tone="ext">Found here</Pill> : null}
            <QtyStepper
              label="Counted"
              unit={line.item.uom}
              value={draft}
              error={
                draft.trim() === '' || isQty(draft)
                  ? undefined
                  : 'Enter a quantity'
              }
              onChange={(v) => setDrafts((d) => ({ ...d, [line.id]: v }))}
            />
          </div>
        );
      })}
      {found.map((f) => (
        <div key={f.part.id} className="dax-line">
          <div className="dax-line-top">
            <div style={{ minWidth: 0 }}>
              <span className="p">
                <Mono>{f.part.partNo}</Mono>
              </span>{' '}
              <span className="dax-muted">{f.part.brand}</span>
              <span className="dax-sub">{f.part.description}</span>
            </div>
            <ActionIcon
              size="lg"
              variant="subtle"
              color="red"
              aria-label="Remove this part"
              onClick={() =>
                setFound((prev) => prev.filter((x) => x.part.id !== f.part.id))
              }
            >
              <Icon name="close" size={20} />
            </ActionIcon>
          </div>
          <Pill tone="ext">Found here · not saved yet</Pill>
          <QtyStepper
            label="Counted"
            unit={f.part.uom}
            value={f.qty}
            error={isQty(f.qty) ? undefined : 'Enter a quantity'}
            onChange={(qty) =>
              setFound((prev) =>
                prev.map((x) => (x.part.id === f.part.id ? { ...x, qty } : x)),
              )
            }
          />
        </div>
      ))}
      <PartFinder
        onPick={pick}
        label="Add an item found here"
        title={`Found in ${bin.code}`}
        scanHint="Scan each part you find in this bin that is not on the sheet."
      />
      <Button
        size="lg"
        disabled={!dirty || invalid}
        loading={saving}
        onClick={submit}
      >
        Save counts for {bin.code}
      </Button>
    </Stack>
  );
}

export function CountSheet({
  count,
  canSubmit,
}: {
  count: CountDto;
  canSubmit: boolean;
}) {
  const [binId, setBinId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [state, dispatch, pending] = useActionState(saveBinCounts, IDLE);
  const bin = count.bins.find((b) => b.id === binId) ?? null;
  const left = count.lineCount - count.countedLines;
  const q = filter.trim().toUpperCase();
  const shown = q
    ? count.bins.filter((b) => b.code.toUpperCase().includes(q))
    : count.bins;

  function open(id: string) {
    setBinId(id);
    window.scrollTo({ top: 0 });
  }

  if (bin)
    return (
      <SectionCard
        title="Count this bin"
        note={`${bin.countedLines} of ${bin.lineCount} counted`}
      >
        <Stack gap="md">
          <StateAlert state={state} />
          <BinCounter
            key={`${bin.id}-${count.version}`}
            count={count}
            bin={bin}
            saving={pending}
            save={(payload) => startTransition(() => dispatch(payload))}
            onBack={() => setBinId(null)}
          />
        </Stack>
      </SectionCard>
    );

  return (
    <SectionCard
      title="Count by bin"
      note={`${count.countedLines} of ${count.lineCount} lines counted`}
    >
      <Stack gap="md">
        <StateAlert state={state} />
        <BinScan bins={count.bins} onPick={open} />
        {count.bins.length > 8 ? (
          <TextInput
            size="md"
            type="search"
            placeholder="Find a bin"
            value={filter}
            onChange={(e) => setFilter(e.currentTarget.value)}
            leftSection={<Icon name="search" size={18} />}
          />
        ) : null}
        <Stack gap="xs">
          {shown.map((b) => {
            const done = b.countedLines === b.lineCount;
            return (
              <UnstyledButton
                key={b.id}
                onClick={() => open(b.id)}
                className="dax-inset"
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '12px 16px',
                }}
              >
                <Group justify="space-between" wrap="nowrap">
                  <span className="dax-zone">{b.code}</span>
                  {b.lineCount === 0 ? (
                    <Pill>Empty</Pill>
                  ) : (
                    <Pill tone={done ? 'ok' : 'hi'}>
                      {b.countedLines} of {b.lineCount} counted
                    </Pill>
                  )}
                </Group>
              </UnstyledButton>
            );
          })}
        </Stack>
        {canSubmit ? (
          left > 0 ? (
            <Alert color="blue">
              {left} {left === 1 ? 'line still needs' : 'lines still need'} a
              count before this can be submitted.
            </Alert>
          ) : (
            <Group justify="flex-end">
              <ConfirmAction
                action={countStep}
                payload={{
                  id: count.id,
                  version: count.version,
                  step: 'submit',
                }}
                label="Submit count"
                title="Submit this count?"
                message="The Stores Manager reviews the differences and posts them. You can't change the counts unless it is sent back."
                confirmLabel="Submit"
              />
            </Group>
          )
        ) : null}
      </Stack>
    </SectionCard>
  );
}
