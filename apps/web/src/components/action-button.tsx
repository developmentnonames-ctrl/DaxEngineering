'use client';

import { Alert, Button, type ButtonProps, Stack } from '@mantine/core';
import { startTransition, useActionState } from 'react';
import { type ActionState, IDLE } from '../lib/action-state';

export function ActionButton<P>({
  action,
  payload,
  children,
  ...props
}: ButtonProps & {
  action: (prev: ActionState, payload: P) => Promise<ActionState>;
  payload: P;
  children: React.ReactNode;
}) {
  const [state, dispatch, pending] = useActionState(action, IDLE);
  return (
    <Stack gap={6} align="flex-end">
      <Button
        {...props}
        loading={pending}
        onClick={() => startTransition(() => dispatch(payload))}
      >
        {children}
      </Button>
      {state.error ? (
        <Alert color="red" py={6}>
          {state.error}
        </Alert>
      ) : null}
    </Stack>
  );
}
