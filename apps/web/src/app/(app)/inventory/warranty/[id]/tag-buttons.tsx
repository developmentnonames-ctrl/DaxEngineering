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
import type { WarrantyOutcome } from '@dax/inventory-contract';
import { startTransition, useActionState, useState } from 'react';
import { type ActionState, IDLE } from '../../../../../lib/action-state';
import { searchSuppliers } from '../../receiving/_lib/actions';
import { RemotePicker } from '../../_lib/pickers';
import type { PickerOption } from '../../_lib/search-actions';
import { closeTag, sendTag } from '../_lib/actions';
import { needsNote, OUTCOME_OPTIONS } from '../_lib/labels';

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

export function SendButton({
  id,
  version,
  supplier,
  claimNumber: initialClaim,
}: {
  id: string;
  version: number;
  supplier: PickerOption | null;
  claimNumber: string | null;
}) {
  const [supplierId, setSupplierId] = useState<string | null>(
    supplier?.value ?? null,
  );
  const [claimNumber, setClaimNumber] = useState(initialClaim ?? '');
  const { opened, setOpened, state, run, pending } = useDialog(sendTag);
  return (
    <>
      <Button onClick={() => setOpened(true)}>Send to supplier</Button>
      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title="Send to the supplier"
        centered
      >
        <Stack>
          <Text size="sm">
            Record that the part has left for the supplier's assessment.
          </Text>
          <RemotePicker
            label="Supplier"
            required
            search={searchSuppliers}
            initial={supplier}
            value={supplierId}
            onChange={setSupplierId}
            placeholder="Type a supplier name"
            error={state.fields?.['supplierId']}
          />
          <TextInput
            label="Supplier claim number"
            description="Optional"
            maxLength={60}
            value={claimNumber}
            onChange={(e) => setClaimNumber(e.currentTarget.value)}
            error={state.fields?.['claimNumber']}
          />
          {state.error ? <Alert color="red">{state.error}</Alert> : null}
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setOpened(false)}>
              Not now
            </Button>
            <Button
              loading={pending}
              onClick={() =>
                run({ id, version, supplierId: supplierId ?? '', claimNumber })
              }
            >
              Mark as sent
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}

export function CloseButton({ id, version }: { id: string; version: number }) {
  const [outcome, setOutcome] = useState<WarrantyOutcome | null>(null);
  const [note, setNote] = useState('');
  const { opened, setOpened, state, run, pending } = useDialog(closeTag);
  const noteRequired = needsNote(outcome);
  return (
    <>
      <Button variant="default" onClick={() => setOpened(true)}>
        Close
      </Button>
      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title="Close this warranty tag"
        centered
      >
        <Stack>
          <Select
            label="Outcome"
            required
            data={OUTCOME_OPTIONS}
            value={outcome}
            onChange={(v) =>
              setOutcome(
                OUTCOME_OPTIONS.find((o) => o.value === v)?.value ?? null,
              )
            }
            allowDeselect={false}
            comboboxProps={{ withinPortal: true }}
            error={state.fields?.['outcome']}
          />
          <Textarea
            label="Closing note"
            description={
              noteRequired
                ? 'Say why. For example: supplier found misuse.'
                : 'Optional'
            }
            required={noteRequired}
            autosize
            minRows={2}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.currentTarget.value)}
            error={state.fields?.['note']}
          />
          {state.error ? <Alert color="red">{state.error}</Alert> : null}
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setOpened(false)}>
              Not now
            </Button>
            <Button
              loading={pending}
              onClick={() =>
                run({ id, body: { version, outcome: outcome ?? '', note } })
              }
            >
              Close tag
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
