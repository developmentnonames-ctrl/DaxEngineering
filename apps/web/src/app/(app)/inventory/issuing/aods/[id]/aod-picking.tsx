'use client';

import {
  ActionIcon,
  Alert,
  Button,
  Group,
  List,
  ListItem,
  Modal,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import {
  startTransition,
  useActionState,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';
import type { AodDto } from '@dax/inventory-contract';
import { Icon, Mono, Pill, Scanner, SectionCard } from '@dax/web-shell';
import { StateAlert } from '../../../../../../components/state-alert';
import {
  type ActionState,
  fieldError,
  IDLE,
} from '../../../../../../lib/action-state';
import { formatQty, trimQty } from '../../../../../../lib/format';
import {
  isQty,
  qtyNumber,
  qtyText,
  round3,
} from '../../../receiving/_lib/lines';
import { QtyStepper } from '../../../receiving/_lib/qty-stepper';
import { aodStep, identifyCode } from '../../_lib/actions';
import { AOD_TYPE_OPTIONS, type AodType } from '../../_lib/labels';

export type BinStock = { id: string; code: string; qty: string };

interface PickLine {
  key: string;
  id?: string;
  mrnLineId: string;
  item: AodDto['lines'][number]['item'];
  reserved: string;
  bin: { id: string; code: string } | null;
  qty: string;
  binOk: boolean;
  partOk: boolean;
}

function toPickLine(line: AodDto['lines'][number]): PickLine {
  return {
    key: line.id,
    id: line.id,
    mrnLineId: line.mrnLineId,
    item: line.item,
    reserved: line.reservedForLine,
    bin: line.bin,
    qty: trimQty(line.qty),
    binOk: line.scanned,
    partOk: line.scanned,
  };
}

const scanned = (l: PickLine) => l.binOk && l.partOk;

function ScanConfirm({
  line,
  onBin,
  onPart,
  onClose,
}: {
  line: PickLine;
  onBin: (bin: { id: string; code: string }) => void;
  onPart: () => void;
  onClose: () => void;
}) {
  const [pending, startLookup] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const busy = useRef(false);

  function handle(code: string) {
    if (busy.current) return;
    busy.current = true;
    startLookup(async () => {
      try {
        const match = await identifyCode(code);
        if (match.type === 'bin') {
          setMessage(null);
          onBin(match.bin);
        } else if (match.type === 'part') {
          if (match.itemIds.includes(line.item.id)) {
            setMessage(null);
            onPart();
          } else
            setMessage(
              `That is a different part. This line needs ${line.item.partNo}.`,
            );
        } else if (match.type === 'none')
          setMessage('Nothing matches that code.');
        else setMessage(match.message);
      } finally {
        busy.current = false;
      }
    });
  }

  return (
    <Stack gap="md">
      <Text size="sm">
        Scan the bin label, then the part. Both confirm the pick.
      </Text>
      <Group gap="xs">
        <Pill tone={line.binOk ? 'ok' : undefined}>
          {line.binOk
            ? `Bin ${line.bin?.code ?? ''} confirmed`
            : 'Bin not scanned'}
        </Pill>
        <Pill tone={line.partOk ? 'ok' : undefined}>
          {line.partOk ? 'Part confirmed' : 'Part not scanned'}
        </Pill>
      </Group>
      <Scanner onCode={handle} busy={pending} />
      {message ? <Alert color="orange">{message}</Alert> : null}
      <Button size="lg" onClick={onClose}>
        Done
      </Button>
    </Stack>
  );
}

function LineCard({
  line,
  bins,
  max,
  error,
  onChange,
  onScan,
  onSplit,
  onRemove,
}: {
  line: PickLine;
  bins: BinStock[];
  max: number;
  error?: string;
  onChange: (patch: Partial<PickLine>) => void;
  onScan: () => void;
  onSplit: (() => void) | null;
  onRemove: (() => void) | null;
}) {
  const here = bins.find((b) => b.id === line.bin?.id);
  const tone = !line.bin ? 'bad' : scanned(line) ? 'ok' : undefined;
  return (
    <div className="dax-line" data-tone={tone}>
      <div className="dax-line-top">
        <div style={{ minWidth: 0 }}>
          <span className="p">
            <Mono>{line.item.partNo}</Mono>
          </span>{' '}
          <span className="dax-muted">{line.item.brand}</span>
          <span className="dax-sub">{line.item.description}</span>
          <span className="dax-sub">
            Reserved for this line <b>{formatQty(line.reserved)}</b>{' '}
            {line.item.uom}
          </span>
        </div>
        {onRemove ? (
          <ActionIcon
            size="lg"
            variant="subtle"
            color="red"
            aria-label={`Remove this pick of ${line.item.partNo}`}
            onClick={onRemove}
          >
            <Icon name="close" size={20} />
          </ActionIcon>
        ) : null}
      </div>
      <Group justify="space-between" wrap="nowrap" align="center">
        {line.bin ? (
          <span className="dax-zone" style={{ fontSize: 18 }}>
            {line.bin.code}
          </span>
        ) : (
          <Pill tone="bad">Choose a bin</Pill>
        )}
        <span className="dax-sub" style={{ textAlign: 'right' }}>
          {here ? `${formatQty(here.qty)} ${line.item.uom} in this bin` : null}
        </span>
      </Group>
      {bins.length > 0 ? (
        <div className="dax-chips" role="group" aria-label="Bins with stock">
          {bins.map((b) => (
            <button
              key={b.id}
              type="button"
              aria-pressed={line.bin?.id === b.id}
              onClick={() =>
                onChange({
                  bin: { id: b.id, code: b.code },
                  binOk: false,
                })
              }
            >
              <Mono>{b.code}</Mono> · {formatQty(b.qty)}
            </button>
          ))}
        </div>
      ) : (
        <span className="dax-sub">No bin shows stock of this part.</span>
      )}
      <div className="dax-steppers">
        <QtyStepper
          label="Pick"
          unit={line.item.uom}
          value={line.qty}
          max={max}
          error={error}
          onChange={(qty) => onChange({ qty })}
        />
      </div>
      <Group gap="sm">
        <Button
          size="md"
          variant={scanned(line) ? 'light' : 'default'}
          color={scanned(line) ? 'green' : undefined}
          leftSection={
            <Icon name={scanned(line) ? 'check' : 'scan'} size={18} />
          }
          onClick={onScan}
        >
          {scanned(line) ? 'Scanned' : 'Scan to confirm'}
        </Button>
        {onSplit ? (
          <Button size="md" variant="subtle" onClick={onSplit}>
            Pick some from another bin
          </Button>
        ) : null}
      </Group>
    </div>
  );
}

export function AodPicking({
  aod,
  binsByLine,
}: {
  aod: AodDto;
  binsByLine: Record<string, BinStock[]>;
}) {
  const [state, dispatch, pending] = useActionState(aodStep, IDLE);
  const [type, setType] = useState<AodType>(aod.type);
  const [deliverTo, setDeliverTo] = useState(aod.deliverTo ?? '');
  const [vehicleNo, setVehicleNo] = useState(aod.vehicleNo ?? '');
  const [notes, setNotes] = useState(aod.notes ?? '');
  const [lines, setLines] = useState<PickLine[]>(() =>
    aod.lines.map(toPickLine),
  );
  const [scanning, setScanning] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const phone = useMediaQuery('(max-width: 48em)');
  const err = (key: string) => fieldError(state, key);

  const update = useMemo(
    () => ({
      type,
      deliverTo,
      vehicleNo,
      notes,
      lines: lines.map((l) => ({
        id: l.id,
        mrnLineId: l.mrnLineId,
        binId: l.bin?.id ?? null,
        qty: l.qty.trim(),
        scanned: scanned(l),
      })),
    }),
    [type, deliverTo, vehicleNo, notes, lines],
  );
  const [saved] = useState(() => JSON.stringify(update));
  const dirty = JSON.stringify(update) !== saved;

  const picked = (mrnLineId: string, except?: string) =>
    round3(
      lines
        .filter((l) => l.mrnLineId === mrnLineId && l.key !== except)
        .reduce((sum, l) => sum + qtyNumber(l.qty), 0),
    );
  const lineError = (l: PickLine, i: number): string | undefined => {
    if (!isQty(l.qty) || qtyNumber(l.qty) <= 0) return 'Enter more than 0';
    if (picked(l.mrnLineId) > qtyNumber(l.reserved))
      return `Only ${formatQty(l.reserved)} reserved across its bins`;
    return err(`lines.${i}.qty`);
  };
  const invalid = lines.some((l, i) => lineError(l, i) !== undefined);
  const noBin = lines.some((l) => !l.bin);
  const unscanned = lines.filter((l) => !scanned(l)).length;
  const scanLine = lines.find((l) => l.key === scanning) ?? null;

  function patch(key: string, change: Partial<PickLine>) {
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, ...change } : l)),
    );
  }

  function split(line: PickLine) {
    const left = round3(qtyNumber(line.reserved) - picked(line.mrnLineId));
    const taken = left > 0 ? left : 1;
    setLines((prev) => {
      const at = prev.findIndex((l) => l.key === line.key);
      const next = prev.map((l) =>
        l.key === line.key && left <= 0
          ? { ...l, qty: qtyText(qtyNumber(l.qty) - 1) }
          : l,
      );
      next.splice(at + 1, 0, {
        ...line,
        key: `split-${Date.now()}`,
        id: undefined,
        bin: null,
        qty: qtyText(taken),
        binOk: false,
        partOk: false,
      });
      return next;
    });
  }

  function send(step: 'save' | 'issue') {
    startTransition(() =>
      dispatch({
        id: aod.id,
        version: aod.version,
        step,
        update: dirty ? update : undefined,
      }),
    );
  }

  const sameLine = (l: PickLine) =>
    lines.filter((o) => o.mrnLineId === l.mrnLineId).length;

  return (
    <Stack gap="lg">
      <SectionCard title="Dispatch">
        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          <Select
            label="Dispatch type"
            data={AOD_TYPE_OPTIONS}
            value={type}
            onChange={(v) => {
              const found = AOD_TYPE_OPTIONS.find((o) => o.value === v);
              if (found) setType(found.value);
            }}
            allowDeselect={false}
            comboboxProps={{ withinPortal: true }}
            size="md"
          />
          <TextInput
            label="Deliver to"
            maxLength={120}
            value={deliverTo}
            onChange={(e) => setDeliverTo(e.currentTarget.value)}
            error={err('deliverTo')}
            size="md"
          />
          <TextInput
            label="Vehicle number"
            maxLength={20}
            value={vehicleNo}
            onChange={(e) => setVehicleNo(e.currentTarget.value)}
            error={err('vehicleNo')}
            size="md"
          />
        </SimpleGrid>
        <Textarea
          mt="md"
          label="Notes"
          autosize
          minRows={1}
          maxLength={1000}
          value={notes}
          onChange={(e) => setNotes(e.currentTarget.value)}
          size="md"
        />
      </SectionCard>

      <SectionCard
        title="Pick each part"
        note="Scanning is optional but confirms the right bin and part"
      >
        <Stack gap="md">
          {lines.map((line, i) => {
            const left = round3(
              qtyNumber(line.reserved) - picked(line.mrnLineId, line.key),
            );
            return (
              <LineCard
                key={line.key}
                line={line}
                bins={binsByLine[line.mrnLineId] ?? []}
                max={Math.max(0, left)}
                error={lineError(line, i)}
                onChange={(change) => patch(line.key, change)}
                onScan={() => setScanning(line.key)}
                onSplit={
                  qtyNumber(line.reserved) > 1 ? () => split(line) : null
                }
                onRemove={
                  sameLine(line) > 1
                    ? () =>
                        setLines((prev) =>
                          prev.filter((l) => l.key !== line.key),
                        )
                    : null
                }
              />
            );
          })}
        </Stack>
      </SectionCard>

      {state.error ? <StateAlert state={state} /> : null}

      <div className="dax-bar">
        <span className="note">
          {dirty
            ? 'Unsaved changes'
            : unscanned
              ? `${unscanned} not scanned`
              : 'All picks scanned'}
        </span>
        {dirty ? (
          <Button
            size="lg"
            variant="default"
            loading={pending}
            disabled={invalid}
            onClick={() => send('save')}
          >
            Save
          </Button>
        ) : null}
        <Button
          size="lg"
          color="ember"
          disabled={invalid || noBin || lines.length === 0}
          onClick={() => setConfirming(true)}
        >
          Issue
        </Button>
      </div>

      <Modal
        opened={scanLine !== null}
        onClose={() => setScanning(null)}
        title={scanLine ? `Confirm ${scanLine.item.partNo}` : 'Confirm'}
        fullScreen={phone ?? false}
        size="lg"
      >
        {scanLine ? (
          <ScanConfirm
            line={scanLine}
            onBin={(bin) => patch(scanLine.key, { bin, binOk: true })}
            onPart={() => patch(scanLine.key, { partOk: true })}
            onClose={() => setScanning(null)}
          />
        ) : null}
      </Modal>

      <IssueDialog
        opened={confirming}
        onClose={() => setConfirming(false)}
        lines={lines.length}
        unscanned={unscanned}
        pending={pending}
        state={state}
        onConfirm={() => send('issue')}
      />
    </Stack>
  );
}

function IssueDialog({
  opened,
  onClose,
  lines,
  unscanned,
  pending,
  state,
  onConfirm,
}: {
  opened: boolean;
  onClose: () => void;
  lines: number;
  unscanned: number;
  pending: boolean;
  state: ActionState;
  onConfirm: () => void;
}) {
  return (
    <Modal opened={opened} onClose={onClose} title="Issue this AOD?" centered>
      <Stack>
        <List size="sm" spacing={6}>
          <ListItem>
            The stock on {lines} {lines === 1 ? 'pick' : 'picks'} leaves its
            bins now.
          </ListItem>
          <ListItem>The AOD gets its number.</ListItem>
          <ListItem>
            Print it, have it signed on delivery and upload the signed copy to
            complete it.
          </ListItem>
        </List>
        {unscanned ? (
          <Alert color="yellow">
            {unscanned} {unscanned === 1 ? 'pick was' : 'picks were'} not
            confirmed by scanning.
          </Alert>
        ) : null}
        {state.error ? <Alert color="red">{state.error}</Alert> : null}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Not yet
          </Button>
          <Button color="ember" loading={pending} onClick={onConfirm}>
            Issue AOD
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
