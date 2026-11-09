'use client';

import {
  Alert,
  Button,
  type ButtonProps,
  Group,
  List,
  ListItem,
  Modal,
  Stack,
  Text,
  Textarea,
} from '@mantine/core';
import { startTransition, useActionState, useState } from 'react';
import { type ActionState, IDLE } from '../../../../../../lib/action-state';
import { reverseGrn, runGrnStep } from '../../_lib/actions';
import type { PostSummary } from '../../_lib/lines';

function useStep() {
  const [opened, setOpened] = useState(false);
  const [state, dispatch, pending] = useActionState(
    async (prev: ActionState, payload: Parameters<typeof runGrnStep>[1]) => {
      const result = await runGrnStep(prev, payload);
      if (result.ok) setOpened(false);
      return result;
    },
    IDLE,
  );
  return { opened, setOpened, state, dispatch, pending };
}

export function PostGrnButton({
  id,
  version,
  summary,
  size = 'lg',
}: {
  id: string;
  version: number;
  summary: PostSummary;
  size?: ButtonProps['size'];
}) {
  const { opened, setOpened, state, dispatch, pending } = useStep();
  return (
    <>
      <Button size={size} color="ember" onClick={() => setOpened(true)}>
        Post
      </Button>
      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title="Post this GRN?"
        centered
      >
        <Stack>
          <Text size="sm">Posting brings the delivery into stock:</Text>
          <List size="sm" spacing={6}>
            <ListItem>
              The GRN gets its number, for example GRN/FOR/26/0001.
            </ListItem>
            <ListItem>
              Good stock on {summary.goodLines}{' '}
              {summary.goodLines === 1 ? 'line' : 'lines'} goes to the receiving
              bin. It becomes free only after put-away.
            </ListItem>
            {summary.damagedLines ? (
              <ListItem>
                Damaged stock on {summary.damagedLines}{' '}
                {summary.damagedLines === 1 ? 'line' : 'lines'} goes to
                quarantine and is never free.
              </ListItem>
            ) : null}
            {summary.flagged ? (
              <ListItem>
                {summary.flagged}{' '}
                {summary.flagged === 1 ? 'line opens' : 'lines open'} a
                discrepancy (short, extra, damaged or wrong item) for the
                supplier claim.
              </ListItem>
            ) : null}
            <ListItem>
              Stock is received today. The delivery date is kept for
              information.
            </ListItem>
          </List>
          {state.error ? <Alert color="red">{state.error}</Alert> : null}
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setOpened(false)}>
              Not yet
            </Button>
            <Button
              color="ember"
              loading={pending}
              onClick={() =>
                startTransition(() => dispatch({ id, version, step: 'post' }))
              }
            >
              Post GRN
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}

export function CancelDraftButton({
  id,
  version,
}: {
  id: string;
  version: number;
}) {
  const { opened, setOpened, state, dispatch, pending } = useStep();
  return (
    <>
      <Button
        size="lg"
        variant="subtle"
        color="red"
        onClick={() => setOpened(true)}
      >
        Cancel draft
      </Button>
      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title="Cancel this draft?"
        centered
      >
        <Stack>
          <Text size="sm">
            Nothing has been received into stock yet, so nothing changes in the
            store. The counts on this draft are kept but it can no longer be
            posted.
          </Text>
          {state.error ? <Alert color="red">{state.error}</Alert> : null}
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setOpened(false)}>
              Keep it
            </Button>
            <Button
              color="red"
              loading={pending}
              onClick={() =>
                startTransition(() => dispatch({ id, version, step: 'cancel' }))
              }
            >
              Cancel draft
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}

export function ReverseGrnButton({
  id,
  version,
  number,
}: {
  id: string;
  version: number;
  number: string;
}) {
  const [opened, setOpened] = useState(false);
  const [reason, setReason] = useState('');
  const [state, dispatch, pending] = useActionState(
    async (prev: ActionState, payload: Parameters<typeof reverseGrn>[1]) => {
      const result = await reverseGrn(prev, payload);
      if (result.ok) setOpened(false);
      return result;
    },
    IDLE,
  );
  const short = reason.trim().length < 5;
  return (
    <>
      <Button variant="default" color="red" onClick={() => setOpened(true)}>
        Reverse
      </Button>
      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title={`Reverse ${number}?`}
        centered
      >
        <Stack>
          <Text size="sm">
            Reversing takes the received stock back out of the receiving bin and
            quarantine. It only works while none of it has been put away or
            used.
          </Text>
          <Textarea
            label="Reason"
            description="At least 5 characters. Kept on the GRN."
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
              Keep it
            </Button>
            <Button
              color="red"
              loading={pending}
              disabled={short}
              onClick={() =>
                startTransition(() =>
                  dispatch({ id, version, reason: reason.trim() }),
                )
              }
            >
              Reverse GRN
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
