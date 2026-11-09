'use client';

import {
  Button,
  Group,
  Stack,
  Switch,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useActionState } from 'react';
import { type ActionState, fieldError, IDLE } from '../../../lib/action-state';
import { StateAlert } from '../../../components/state-alert';

export function RoleForm({
  action,
  defaults,
  submitLabel,
  readOnly = false,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  defaults?: { name: string; description: string | null; require2fa: boolean };
  submitLabel: string;
  readOnly?: boolean;
}) {
  const [state, dispatch, pending] = useActionState(action, IDLE);
  return (
    <form action={dispatch}>
      <Stack>
        <StateAlert state={state} />
        <TextInput
          name="name"
          label="Name"
          required
          maxLength={60}
          defaultValue={defaults?.name}
          readOnly={readOnly}
          error={fieldError(state, 'name')}
        />
        <Textarea
          name="description"
          label="Description"
          description="What people with this role do."
          maxLength={300}
          autosize
          minRows={2}
          defaultValue={defaults?.description ?? ''}
          readOnly={readOnly}
          error={fieldError(state, 'description')}
        />
        <Switch
          name="require2fa"
          label="Require two-step sign-in"
          description="Everyone with this role must enter a code from an authenticator app when they sign in."
          defaultChecked={defaults?.require2fa ?? false}
          disabled={readOnly}
        />
        {readOnly ? null : (
          <Group>
            <Button type="submit" loading={pending}>
              {submitLabel}
            </Button>
          </Group>
        )}
      </Stack>
    </form>
  );
}
