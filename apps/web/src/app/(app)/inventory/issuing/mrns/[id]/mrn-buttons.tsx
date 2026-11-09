'use client';

import {
  Alert,
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { startTransition, useActionState, useState } from 'react';
import type { MrnDto } from '@dax/inventory-contract';
import { Mono } from '@dax/web-shell';
import { type ActionState, IDLE } from '../../../../../../lib/action-state';
import { formatQty, trimQty } from '../../../../../../lib/format';
import { isQty, qtyNumber, qtyText } from '../../../receiving/_lib/lines';
import { QtyStepper } from '../../../receiving/_lib/qty-stepper';
import { allocateMrn, shortCloseMrn, startPicking } from '../../_lib/actions';
import {
  AOD_TYPE_OPTIONS,
  type AodType,
  DEFAULT_AOD_TYPE,
} from '../../_lib/labels';

function useDialog<P>(
  action: (prev: ActionState, payload: P) => Promise<ActionState>,
) {
  const [opened, setOpened] = useState(false);
  const [state, dispatch, pending] = useActionState(
    async (prev: ActionState, payload: P) => {
      const result = await action(prev, payload);
      if (result.ok) setOpened(false);
      return result;
    },
    IDLE,
  );
  const run = (payload: P) => startTransition(() => dispatch(payload));
  return { opened, setOpened, state, run, pending };
}

export function AllocateButton({ mrn }: { mrn: MrnDto }) {
  const waiting = mrn.lines.filter((l) => qtyNumber(l.qtyWaiting) > 0);
  const initial = () =>
    Object.fromEntries(
      waiting.map((l) => [
        l.id,
        qtyText(
          Math.max(0, Math.min(qtyNumber(l.qtyWaiting), qtyNumber(l.freeNow))),
        ),
      ]),
    );
  const [qty, setQty] = useState<Record<string, string>>(initial);
  const { opened, setOpened, state, run, pending } = useDialog(allocateMrn);
  const lines = waiting.flatMap((l) => {
    const q = (qty[l.id] ?? '0').trim();
    return isQty(q) && qtyNumber(q) > 0 ? [{ mrnLineId: l.id, qty: q }] : [];
  });
  const anyFree = waiting.some((l) => qtyNumber(l.freeNow) > 0);

  return (
    <>
      <Button
        variant="default"
        onClick={() => {
          setQty(initial());
          setOpened(true);
        }}
      >
        Assign stock
      </Button>
      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title="Assign stock to this request"
        size="lg"
        centered
      >
        <Stack>
          <Text size="sm">
            Reserve newly arrived free stock for the waiting lines. Nothing is
            assigned automatically.
          </Text>
          {!anyFree ? (
            <Alert color="orange">
              None of the waiting parts has free stock right now.
            </Alert>
          ) : null}
          {waiting.map((l) => {
            const max = Math.min(qtyNumber(l.qtyWaiting), qtyNumber(l.freeNow));
            return (
              <div key={l.id} className="dax-line">
                <div>
                  <span className="p">
                    <Mono>{l.item.partNo}</Mono>
                  </span>
                  <span className="dax-sub">
                    Waiting <b>{formatQty(l.qtyWaiting)}</b> · Free now{' '}
                    <b>{formatQty(l.freeNow)}</b> {l.item.uom}
                  </span>
                </div>
                <QtyStepper
                  label="Assign"
                  unit={l.item.uom}
                  value={qty[l.id] ?? '0'}
                  max={max}
                  disabled={max <= 0}
                  error={
                    qtyNumber(qty[l.id]) > max
                      ? `At most ${trimQty(String(max))}`
                      : undefined
                  }
                  onChange={(v) => setQty((prev) => ({ ...prev, [l.id]: v }))}
                />
              </div>
            );
          })}
          {state.error ? <Alert color="red">{state.error}</Alert> : null}
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setOpened(false)}>
              Not now
            </Button>
            <Button
              loading={pending}
              disabled={lines.length === 0}
              onClick={() => run({ id: mrn.id, version: mrn.version, lines })}
            >
              Assign {lines.length} {lines.length === 1 ? 'line' : 'lines'}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}

export function StartPickingButton({ mrn }: { mrn: MrnDto }) {
  const [type, setType] = useState<AodType>(DEFAULT_AOD_TYPE[mrn.subtype]);
  const [deliverTo, setDeliverTo] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');
  const [notes, setNotes] = useState('');
  const { opened, setOpened, state, run, pending } = useDialog(startPicking);
  return (
    <>
      <Button onClick={() => setOpened(true)}>Start picking</Button>
      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title="Start picking"
        centered
      >
        <Stack>
          <Text size="sm">
            Creates a dispatch note (AOD) with every reserved part and its
            suggested bin. Nothing leaves the store until it is issued.
          </Text>
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
            error={state.fields?.['deliverTo']}
            size="md"
          />
          <TextInput
            label="Vehicle number"
            maxLength={20}
            value={vehicleNo}
            onChange={(e) => setVehicleNo(e.currentTarget.value)}
            error={state.fields?.['vehicleNo']}
            size="md"
          />
          <Textarea
            label="Notes"
            autosize
            minRows={1}
            maxLength={1000}
            value={notes}
            onChange={(e) => setNotes(e.currentTarget.value)}
            size="md"
          />
          {state.error ? <Alert color="red">{state.error}</Alert> : null}
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setOpened(false)}>
              Not now
            </Button>
            <Button
              loading={pending}
              onClick={() =>
                run({ mrnId: mrn.id, type, deliverTo, vehicleNo, notes })
              }
            >
              Start picking
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}

export function ShortCloseButton({ mrn }: { mrn: MrnDto }) {
  const [reason, setReason] = useState('');
  const { opened, setOpened, state, run, pending } = useDialog(shortCloseMrn);
  return (
    <>
      <Button variant="default" color="red" onClick={() => setOpened(true)}>
        Short-close
      </Button>
      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title="Short-close this request?"
        centered
      >
        <Stack>
          <Text size="sm">
            The waiting quantities are dropped and the request closes once what
            is reserved has been issued.
          </Text>
          <Textarea
            label="Reason"
            description="At least 5 characters."
            autosize
            minRows={2}
            maxLength={300}
            value={reason}
            onChange={(e) => setReason(e.currentTarget.value)}
            error={state.fields?.['reason']}
            data-autofocus
          />
          {state.error ? <Alert color="red">{state.error}</Alert> : null}
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setOpened(false)}>
              Keep it open
            </Button>
            <Button
              color="red"
              loading={pending}
              disabled={reason.trim().length < 5}
              onClick={() =>
                run({ id: mrn.id, version: mrn.version, reason: reason.trim() })
              }
            >
              Short-close
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
