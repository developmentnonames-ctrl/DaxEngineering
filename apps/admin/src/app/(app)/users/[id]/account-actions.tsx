'use client';

import { Button, Group, Stack } from '@mantine/core';
import { useActionState } from 'react';
import { StateAlert } from '../../../../components/state-alert';
import { type ActionState, IDLE } from '../../../../lib/action-state';
import type { UserStatus } from '../../../../lib/format';
import { accountAction } from '../actions';

export function AccountActions({
  userId,
  status,
  hasPassword,
  isSelf,
}: {
  userId: string;
  status: UserStatus;
  hasPassword: boolean;
  isSelf: boolean;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    accountAction,
    IDLE,
  );
  const active = status !== 'Deactivated';

  return (
    <Stack gap="xs" align="flex-end">
      <form action={action}>
        <input type="hidden" name="userId" value={userId} />
        <Group gap="xs" justify="flex-end">
          {status === 'Locked' ? (
            <Button
              type="submit"
              name="action"
              value="unlock"
              variant="light"
              disabled={pending}
            >
              Unlock
            </Button>
          ) : null}
          {active ? (
            <Button
              type="submit"
              name="action"
              value="password-link"
              variant="light"
              disabled={pending}
            >
              {hasPassword ? 'Send reset link' : 'Resend invite'}
            </Button>
          ) : null}
          {isSelf ? null : active ? (
            <Button
              type="submit"
              name="action"
              value="deactivate"
              color="red"
              variant="light"
              disabled={pending}
              onClick={(e) => {
                if (
                  !window.confirm(
                    'Deactivate this account? They will be signed out.',
                  )
                )
                  e.preventDefault();
              }}
            >
              Deactivate
            </Button>
          ) : (
            <Button
              type="submit"
              name="action"
              value="activate"
              variant="light"
              disabled={pending}
            >
              Activate
            </Button>
          )}
        </Group>
      </form>
      <StateAlert state={state} />
    </Stack>
  );
}
