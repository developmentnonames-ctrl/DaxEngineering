'use client';

import {
  Alert,
  Button,
  Group,
  Modal,
  Stack,
  Text,
  Textarea,
} from '@mantine/core';
import { startTransition, useActionState, useState } from 'react';
import { type ActionState, IDLE } from '../../../../../lib/action-state';
import { countReasonStep } from '../_lib/actions';

const COPY = {
  'send-back': {
    label: 'Send back',
    title: 'Send this count back for a recount?',
    message:
      'The bins stay frozen and the counters can correct their counts. What they entered is kept.',
    confirm: 'Send back',
    color: undefined,
  },
  cancel: {
    label: 'Cancel count',
    title: 'Cancel this count?',
    message:
      'Nothing is posted and the bins are free again. The counts entered so far are kept on the record.',
    confirm: 'Cancel count',
    color: 'red',
  },
} as const;

export function CountReasonButton({
  id,
  version,
  step,
}: {
  id: string;
  version: number;
  step: keyof typeof COPY;
}) {
  const copy = COPY[step];
  const [opened, setOpened] = useState(false);
  const [reason, setReason] = useState('');
  const [state, dispatch, pending] = useActionState(
    async (
      prev: ActionState,
      payload: Parameters<typeof countReasonStep>[1],
    ) => {
      const result = await countReasonStep(prev, payload);
      if (result.ok) setOpened(false);
      return result;
    },
    IDLE,
  );
  return (
    <>
      <Button
        variant="default"
        color={copy.color}
        onClick={() => setOpened(true)}
      >
        {copy.label}
      </Button>
      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title={copy.title}
        centered
      >
        <Stack>
          <Text size="sm">{copy.message}</Text>
          <Textarea
            label="Reason"
            required
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
              Not now
            </Button>
            <Button
              color={copy.color}
              loading={pending}
              disabled={reason.trim().length < 5}
              onClick={() =>
                startTransition(() => dispatch({ id, version, step, reason }))
              }
            >
              {copy.confirm}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
