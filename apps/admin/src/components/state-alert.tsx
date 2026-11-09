'use client';

import { Alert } from '@mantine/core';
import type { ActionState } from '../lib/action-state';

export function StateAlert({
  state,
  success,
}: {
  state: ActionState;
  success?: string;
}) {
  if (state.error) return <Alert color="red">{state.error}</Alert>;
  const message = state.message ?? success;
  if (state.ok && message) return <Alert color="green">{message}</Alert>;
  return null;
}
