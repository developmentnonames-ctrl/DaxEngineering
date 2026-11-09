'use client';

import { Button, MultiSelect, Stack, Text, TextInput } from '@mantine/core';
import { startTransition, useActionState } from 'react';
import { SectionCard } from '@dax/web-shell';
import { StateAlert } from '../../../../components/state-alert';
import {
  type ActionState,
  fieldError,
  IDLE,
} from '../../../../lib/action-state';
import { createUser } from '../actions';

interface Option {
  value: string;
  label: string;
}

export function NewUserForm({
  roles,
  departments,
}: {
  roles: Option[];
  departments: Option[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    createUser,
    IDLE,
  );
  const err = (field: string) => fieldError(state, field);

  return (
    <SectionCard title="Details">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          startTransition(() => action(data));
        }}
      >
        <Stack>
          <StateAlert state={state} />
          <TextInput
            name="name"
            label="Full name"
            required
            error={err('name')}
          />
          <TextInput
            name="username"
            label="Username"
            description="3–30 letters, numbers, dots or underscores."
            autoCapitalize="none"
            spellCheck={false}
            required
            error={err('username')}
          />
          <TextInput
            name="email"
            type="email"
            label="Email"
            description="Used to set and reset the password."
            required
            error={err('email')}
          />
          <MultiSelect
            name="departmentIds"
            label="Departments"
            description="Department-wide access covers these departments."
            data={departments}
            searchable
            clearable
            error={err('departmentIds')}
          />
          {roles.length ? (
            <MultiSelect
              name="roleIds"
              label="Roles"
              description="You can add expiry dates after the user is added."
              data={roles}
              searchable
              clearable
              error={err('roleIds')}
            />
          ) : null}
          <Text size="sm" c="dimmed">
            The user gets an email with a link to set their password. The link
            expires in 72 hours.
          </Text>
          <Button
            type="submit"
            loading={pending}
            disabled={pending}
            style={{ alignSelf: 'flex-start' }}
          >
            Add user
          </Button>
        </Stack>
      </form>
    </SectionCard>
  );
}
