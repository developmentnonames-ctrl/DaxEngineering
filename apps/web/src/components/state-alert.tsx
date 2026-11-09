'use client';

import { Alert, Group } from '@mantine/core';
import type { ActionState } from '../lib/action-state';
import { AppLink } from './links';

export function StateAlert({
  state,
  success,
}: {
  state: ActionState;
  success?: string;
}) {
  if (state.error) return <Alert color="red">{state.error}</Alert>;
  const message = state.message ?? success;
  if (!state.ok || !message) return null;
  return (
    <Alert color="green">
      <Group gap="xs">
        {message}
        {state.href ? <AppLink href={state.href}>Open</AppLink> : null}
      </Group>
    </Alert>
  );
}
