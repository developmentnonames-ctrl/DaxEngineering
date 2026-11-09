import { Anchor, Paper, Stack, Text, Title } from '@mantine/core';
import { requirePermission } from '../../../../lib/server';
import { createRole } from '../actions';
import { RoleForm } from '../role-form';

export default async function NewRolePage() {
  await requirePermission('core.roles.manage');
  return (
    <Stack maw={560}>
      <Anchor href="/roles" size="sm">
        Back to roles
      </Anchor>
      <Title order={2}>Add role</Title>
      <Text size="sm" c="dimmed">
        You can set permissions and field access after the role is added.
      </Text>
      <Paper withBorder p="lg">
        <RoleForm action={createRole} submitLabel="Add role" />
      </Paper>
    </Stack>
  );
}
