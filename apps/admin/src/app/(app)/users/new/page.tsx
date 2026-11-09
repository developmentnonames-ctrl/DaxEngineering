import { Anchor, Stack, Title } from '@mantine/core';
import { NewUserForm } from './new-user-form';

export default function NewUserPage() {
  return (
    <Stack maw={480}>
      <Anchor href="/users" size="sm">
        Back to users
      </Anchor>
      <Title order={2}>Add user</Title>
      <NewUserForm />
    </Stack>
  );
}
