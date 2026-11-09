import {
  Alert,
  Badge,
  Button,
  Group,
  Table,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
  Text,
  Title,
} from '@mantine/core';
import { AdminUserList, type AdminUser } from '@dax/platform-contract';
import { api } from '../../../lib/server';
import { userAction } from './actions';

function Status({ user }: { user: AdminUser }) {
  if (!user.active) return <Badge color="gray">Deactivated</Badge>;
  if (user.lockedUntil) return <Badge color="orange">Locked</Badge>;
  if (!user.hasPassword) return <Badge color="yellow">Invited</Badge>;
  return <Badge color="green">Active</Badge>;
}

function ActionButton({
  user,
  action,
  label,
}: {
  user: AdminUser;
  action: Parameters<typeof userAction>[0];
  label: string;
}) {
  return (
    <form action={userAction.bind(null, action, user.id)}>
      <Button type="submit" size="compact-xs" variant="light">
        {label}
      </Button>
    </form>
  );
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>;
}) {
  const [{ users }, { created }, me] = await Promise.all([
    api.request('/admin/users', (d) => AdminUserList.parse(d)),
    searchParams,
    api.getMe(),
  ]);
  return (
    <>
      <Group justify="space-between">
        <Title order={2}>Users</Title>
        <Button component="a" href="/users/new">
          Add user
        </Button>
      </Group>
      {created ? (
        <Alert color="green">
          User added. They will get an email to set their password.
        </Alert>
      ) : null}
      <Table striped withTableBorder>
        <TableThead>
          <TableTr>
            <TableTh>Name</TableTh>
            <TableTh>Username</TableTh>
            <TableTh>Email</TableTh>
            <TableTh>Access</TableTh>
            <TableTh>Two-step</TableTh>
            <TableTh>Status</TableTh>
            <TableTh />
          </TableTr>
        </TableThead>
        <TableTbody>
          {users.map((user) => (
            <TableTr key={user.id}>
              <TableTd>{user.name}</TableTd>
              <TableTd>{user.username ?? '—'}</TableTd>
              <TableTd>{user.email}</TableTd>
              <TableTd>{user.isSuperAdmin ? 'Super admin' : 'Staff'}</TableTd>
              <TableTd>{user.twoFactorEnabled ? 'On' : 'Off'}</TableTd>
              <TableTd>
                <Status user={user} />
              </TableTd>
              <TableTd>
                <Group gap={4} wrap="nowrap">
                  {user.lockedUntil ? (
                    <ActionButton user={user} action="unlock" label="Unlock" />
                  ) : null}
                  {user.active ? (
                    <ActionButton
                      user={user}
                      action="password-link"
                      label={
                        user.hasPassword ? 'Send reset link' : 'Resend invite'
                      }
                    />
                  ) : null}
                  {user.id === me?.user.id ? null : user.active ? (
                    <ActionButton
                      user={user}
                      action="deactivate"
                      label="Deactivate"
                    />
                  ) : (
                    <ActionButton
                      user={user}
                      action="activate"
                      label="Activate"
                    />
                  )}
                </Group>
              </TableTd>
            </TableTr>
          ))}
        </TableTbody>
      </Table>
      <Text size="xs" c="dimmed">
        Roles and per-department access arrive with the access control screens.
      </Text>
    </>
  );
}
