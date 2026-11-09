'use client';

import { Alert, Button, Group, Modal, Stack, Text } from '@mantine/core';
import { startTransition, useActionState, useState } from 'react';
import { type ActionState, IDLE } from '../lib/action-state';

export function ConfirmAction<P>({
  action,
  payload,
  label,
  title,
  message,
  confirmLabel,
  color,
}: {
  action: (prev: ActionState, payload: P) => Promise<ActionState>;
  payload: P;
  label: string;
  title: string;
  message: string;
  confirmLabel?: string;
  color?: string;
}) {
  const [opened, setOpened] = useState(false);
  const [state, dispatch, pending] = useActionState(
    async (prev: ActionState, p: P) => {
      const result = await action(prev, p);
      if (result.ok) setOpened(false);
      return result;
    },
    IDLE,
  );

  return (
    <>
      <Button variant="default" color={color} onClick={() => setOpened(true)}>
        {label}
      </Button>
      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title={title}
        centered
      >
        <Stack>
          <Text size="sm">{message}</Text>
          {state.error ? <Alert color="red">{state.error}</Alert> : null}
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setOpened(false)}>
              Cancel
            </Button>
            <Button
              color={color}
              loading={pending}
              onClick={() => startTransition(() => dispatch(payload))}
            >
              {confirmLabel ?? label}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
