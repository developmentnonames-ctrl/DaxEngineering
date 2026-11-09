'use client';

import {
  Alert,
  Button,
  Checkbox,
  Paper,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { useActionState } from 'react';
import { type CreateUserState, createUser } from '../actions';

export function NewUserForm() {
  const [state, action, pending] = useActionState<CreateUserState, FormData>(
    createUser,
    {},
  );
  const bad = (field: string) =>
    state.fields?.includes(field) ? 'Check this field' : undefined;

  return (
    <Paper withBorder p="lg">
      <form action={action}>
        <Stack>
          {state.error ? <Alert color="red">{state.error}</Alert> : null}
          <TextInput
            name="name"
            label="Full name"
            required
            error={bad('name')}
          />
          <TextInput
            name="username"
            label="Username"
            description="3–30 letters, numbers, dots or underscores."
            autoCapitalize="none"
            spellCheck={false}
            required
            error={bad('username')}
          />
          <TextInput
            name="email"
            type="email"
            label="Email"
            description="Used to set and reset the password."
            required
            error={bad('email')}
          />
          <Checkbox
            name="isSuperAdmin"
            label="Super admin"
            description="Full access to everything, including this panel. Keep to very few people."
          />
          <Text size="sm" c="dimmed">
            The user gets an email with a link to set their password. The link
            expires in 72 hours.
          </Text>
          <Button type="submit" loading={pending}>
            Add user
          </Button>
        </Stack>
      </form>
    </Paper>
  );
}
