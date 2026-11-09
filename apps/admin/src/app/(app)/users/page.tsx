import { Alert, Button } from '@mantine/core';
import { AdminUserList } from '@dax/platform-contract';
import { canDo, Icon, PageHead } from '@dax/web-shell';
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
    <>
      <PageHead
        eyebrow="Admin · People"
        title="Users"
        lede="Everyone who can sign in, with their roles, departments and sign-in status."
        actions={
          canDo(caps, 'core.users.create') ? (
            <Button
              component="a"
              href="/users/new"
              leftSection={<Icon name="user-plus" size={18} />}
            >
              Add user
            </Button>
          ) : null
        }
      />
      {created ? (
        <Alert color="green">
          User added. They will get an email to set their password.
        </Alert>
      ) : null}
      <UsersTable users={users} />
    </>
  );
}
