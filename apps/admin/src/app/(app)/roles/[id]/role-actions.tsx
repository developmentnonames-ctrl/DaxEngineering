'use client';

import { Button, Group, Stack, Text, TextInput, Title } from '@mantine/core';
import { useActionState } from 'react';
import {
  type ActionState,
  fieldError,
  IDLE,
} from '../../../../lib/action-state';
import { StateAlert } from '../../../../components/state-alert';

type FormAction = (prev: ActionState, form: FormData) => Promise<ActionState>;

export function CopyRoleForm({
  roleName,
  action,
}: {
  roleName: string;
  action: FormAction;
}) {
  const [state, dispatch, pending] = useActionState(action, IDLE);
  return (
    <form action={dispatch}>
      <Stack gap="xs">
        <Title order={4}>Copy role</Title>
        <Text size="sm" c="dimmed">
          Makes a new role with the same permissions and field access.
        </Text>
        <StateAlert state={state} />
        <Group align="flex-start">
          <TextInput
            name="name"
            aria-label="Name for the copy"
            required
            maxLength={60}
            defaultValue={`${roleName} (copy)`.slice(0, 60)}
            error={fieldError(state, 'name')}
            style={{ flex: 1 }}
            miw={200}
          />
          <Button type="submit" variant="default" loading={pending}>
            Copy
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

export function ArchiveRoleForm({
  archived,
  action,
}: {
  archived: boolean;
  action: FormAction;
}) {
  const [state, dispatch, pending] = useActionState(action, IDLE);
  return (
    <form action={dispatch}>
      <Stack gap="xs">
        <Title order={4}>{archived ? 'Restore role' : 'Archive role'}</Title>
        <Text size="sm" c="dimmed">
          {archived
            ? 'Restoring makes the role available to assign again.'
            : 'Archived roles move to the archived list and cannot be changed. You can restore it any time.'}
        </Text>
        <StateAlert state={state} />
        <Group>
          <Button
            type="submit"
            variant={archived ? 'default' : 'light'}
            color={archived ? undefined : 'red'}
            loading={pending}
          >
            {archived ? 'Restore' : 'Archive'}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
