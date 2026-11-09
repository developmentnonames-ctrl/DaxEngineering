import { Alert, Button, Group, Stack, Title } from '@mantine/core';
import { AdminUserList } from '@dax/platform-contract';
import { canDo } from '@dax/web-shell';
import { api, requirePermission } from '../../../lib/server';
import { UsersTable } from './users-table';

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>;
}) {
  const caps = await requirePermission('core.users.view');
  const [{ users }, { created }] = await Promise.all([
    api.request('/admin/users', (d) => AdminUserList.parse(d)),
    searchParams,
  ]);
  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>Users</Title>
        {canDo(caps, 'core.users.create') ? (
          <Button component="a" href="/users/new">
            Add user
          </Button>
        ) : null}
      </Group>
      {created ? (
        <Alert color="green">
          User added. They will get an email to set their password.
        </Alert>
      ) : null}
      <UsersTable users={users} />
    </Stack>
  );
}
