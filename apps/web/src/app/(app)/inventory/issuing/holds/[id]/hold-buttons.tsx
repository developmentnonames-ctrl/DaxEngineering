'use client';

import {
  Alert,
  Button,
  Group,
  Modal,
  SegmentedControl,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { startTransition, useActionState, useState } from 'react';
import { type ActionState, IDLE } from '../../../../../../lib/action-state';
import { convertHold, releaseHold } from '../../_lib/actions';
import { MRN_SUBTYPE_OPTIONS, type MrnSubtype } from '../../_lib/labels';

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

export function ReleaseHoldButton({
  id,
  version,
}: {
  id: string;
  version: number;
}) {
  const [reason, setReason] = useState('');
  const { opened, setOpened, state, run, pending } = useDialog(releaseHold);
  return (
    <>
      <Button variant="default" color="red" onClick={() => setOpened(true)}>
        Release
      </Button>
      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title="Release this hold?"
        centered
      >
        <Stack>
          <Text size="sm">The held stock becomes free for anyone again.</Text>
          <Textarea
            label="Reason"
            description="Optional"
            autosize
            minRows={2}
            maxLength={300}
            value={reason}
            onChange={(e) => setReason(e.currentTarget.value)}
            data-autofocus
          />
          {state.error ? <Alert color="red">{state.error}</Alert> : null}
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setOpened(false)}>
              Keep it
            </Button>
            <Button
              color="red"
              loading={pending}
              onClick={() => run({ id, version, reason })}
            >
              Release hold
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}

export function ConvertHoldButton({
  id,
  version,
}: {
  id: string;
  version: number;
}) {
  const [subtype, setSubtype] = useState<MrnSubtype>('PRT');
  const [jobNumber, setJobNumber] = useState('');
  const [customerPo, setCustomerPo] = useState('');
  const [quotationRef, setQuotationRef] = useState('');
  const [notes, setNotes] = useState('');
  const { opened, setOpened, state, run, pending } = useDialog(convertHold);
  const field = (key: string) => state.fields?.[key];
  return (
    <>
      <Button onClick={() => setOpened(true)}>Turn into a request</Button>
      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title="Turn this hold into a request"
        centered
      >
        <Stack>
          <Text size="sm">
            Every held line moves to a new request, already reserved. The whole
            hold converts at once.
          </Text>
          <SegmentedControl
            fullWidth
            value={subtype}
            onChange={(v) =>
              setSubtype(v === 'SRV' ? 'SRV' : v === 'SAL' ? 'SAL' : 'PRT')
            }
            data={MRN_SUBTYPE_OPTIONS}
          />
          <TextInput
            label="Job number"
            maxLength={40}
            value={jobNumber}
            onChange={(e) => setJobNumber(e.currentTarget.value)}
            error={field('jobNumber')}
          />
          <TextInput
            label="Customer PO"
            maxLength={40}
            value={customerPo}
            onChange={(e) => setCustomerPo(e.currentTarget.value)}
            error={field('customerPo')}
          />
          <TextInput
            label="Quotation reference"
            maxLength={40}
            value={quotationRef}
            onChange={(e) => setQuotationRef(e.currentTarget.value)}
            error={field('quotationRef')}
          />
          <Textarea
            label="Notes"
            autosize
            minRows={1}
            maxLength={1000}
            value={notes}
            onChange={(e) => setNotes(e.currentTarget.value)}
          />
          {state.error ? <Alert color="red">{state.error}</Alert> : null}
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setOpened(false)}>
              Not now
            </Button>
            <Button
              loading={pending}
              onClick={() =>
                run({
                  id,
                  version,
                  subtype,
                  jobNumber,
                  customerPo,
                  quotationRef,
                  notes,
                })
              }
            >
              Create request
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
