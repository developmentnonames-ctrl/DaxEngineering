'use client';

import { Button, Stack, Text, TextInput } from '@mantine/core';
import { startTransition, useActionState } from 'react';
import { SectionCard } from '@dax/web-shell';
import { StateAlert } from '../../../../components/state-alert';
import {
  type ActionState,
  fieldError,
  IDLE,
} from '../../../../lib/action-state';
import { updateProfile } from '../actions';

type ProfileField = 'name' | 'username' | 'email';

export function ProfileForm({
  user,
  editable,
}: {
  user: { id: string; name: string; username: string | null; email?: string };
  editable: Record<ProfileField, boolean>;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    updateProfile,
    IDLE,
  );
  const err = (field: string) => fieldError(state, field);
  const anyEditable =
    editable.name ||
    editable.username ||
    (editable.email && user.email !== undefined);

  return (
    <div style={{ maxWidth: 640 }}>
      <SectionCard title="Profile" note="Name and sign-in details">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            startTransition(() => action(data));
          }}
        >
          <Stack>
            <StateAlert state={state} />
            <input type="hidden" name="userId" value={user.id} />
            <TextInput
              name="name"
              label="Full name"
              defaultValue={user.name}
              disabled={!editable.name}
              required
              error={err('name')}
            />
            <TextInput
              name="username"
              label="Username"
              description="3–30 letters, numbers, dots or underscores."
              defaultValue={user.username ?? ''}
              disabled={!editable.username}
              autoCapitalize="none"
              spellCheck={false}
              error={err('username')}
            />
            {user.email !== undefined ? (
              <TextInput
                name="email"
                type="email"
                label="Email"
                defaultValue={user.email}
                disabled={!editable.email}
                required
                error={err('email')}
              />
            ) : null}
            {anyEditable ? (
              <Button
                type="submit"
                loading={pending}
                disabled={pending}
                style={{ alignSelf: 'flex-start' }}
              >
                Save profile
              </Button>
            ) : (
              <Text size="sm" c="dimmed">
                You can't edit this profile.
              </Text>
            )}
          </Stack>
        </form>
      </SectionCard>
    </div>
  );
}
