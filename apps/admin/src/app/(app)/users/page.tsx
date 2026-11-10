import { Alert, Button } from '@mantine/core';
import {
  AdminUserList,
  USER_STATUS_FILTERS,
  type UserStatusFilter,
} from '@dax/platform-contract';
import { canDo, Icon, PageHead, Pager } from '@dax/web-shell';
import { api, requirePermission } from '../../../lib/server';
import { UsersTable } from './users-table';

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{
    created?: string;
    q?: string;
    status?: string;
    page?: string;
    limit?: string;
  }>;
}) {
  const caps = await requirePermission('core.users.view');
  const params = await searchParams;
  const q = params.q?.trim().slice(0, 100) || undefined;
  const status: UserStatusFilter = (
    USER_STATUS_FILTERS as readonly string[]
  ).includes(params.status ?? '')
    ? (params.status as UserStatusFilter)
    : 'all';
  // Same limits as the API: 25 rows by default, at most 100.
  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1);
  const limit = Math.min(
    100,
    Math.max(1, Number.parseInt(params.limit ?? '25', 10) || 25),
  );
  const search = new URLSearchParams({
    status,
    page: String(page),
    limit: String(limit),
  });
  if (q) search.set('q', q);
  const list = await api.request(`/admin/users?${search.toString()}`, (d) =>
    AdminUserList.parse(d),
  );
  const { created } = params;
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
      <UsersTable
        users={list.users}
        total={list.total}
        q={q}
        status={status}
        pager={
          <Pager
            path="/users"
            query={{ q, status: status === 'all' ? undefined : status }}
            total={list.total}
            page={list.page}
            limit={list.limit}
          />
        }
      />
    </>
  );
}
