'use client';

import { Anchor, Table, TextInput } from '@mantine/core';
import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  type AdminUser,
  SEEDED_ROLES,
  type UserStatusFilter,
} from '@dax/platform-contract';
import { Empty, Icon, Mono, Pill, SectionCard } from '@dax/web-shell';
import { STATUS_TONES, userStatus } from '../../../lib/format';

const SUPER_ADMIN = SEEDED_ROLES.super_admin.name;
const isSuperRole = (r: { isSuperAdmin: boolean }) => r.isSuperAdmin;
const FILTERS: { value: UserStatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'invited', label: 'Awaiting password' },
  { value: 'locked', label: 'Locked' },
  { value: 'deactivated', label: 'Deactivated' },
];

/** Search and status live in the URL, so they apply across every page. */
function filterHref(q: string | undefined, status: UserStatusFilter): string {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (status !== 'all') params.set('status', status);
  const text = params.toString();
  return text ? `/users?${text}` : '/users';
}

export function UsersTable({
  users,
  total,
  q,
  status,
  pager,
}: {
  users: AdminUser[];
  total: number;
  q?: string;
  status: UserStatusFilter;
  /** Numbered pages, rendered by the server page. */
  pager: ReactNode;
}) {
  const shown = users;

  return (
    <SectionCard
      flush
      title="People"
      note={`${total} ${total === 1 ? 'person' : 'people'}`}
      toolbar={
        <>
          <form method="get" action="/users" role="search">
            {status !== 'all' ? (
              <input type="hidden" name="status" value={status} />
            ) : null}
            <TextInput
              name="q"
              type="search"
              placeholder="Search by name, username or email"
              aria-label="Search users"
              defaultValue={q ?? ''}
              radius="xl"
              leftSection={<Icon name="search" size={18} />}
              maw={460}
            />
          </form>
          <div className="dax-chips" role="group" aria-label="Status">
            {FILTERS.map((f) => (
              <Link
                key={f.value}
                href={filterHref(q, f.value)}
                aria-current={status === f.value ? 'true' : undefined}
              >
                {f.label}
              </Link>
            ))}
          </div>
        </>
      }
    >
      {shown.length === 0 ? (
        <div className="dax-card-body">
          <Empty title="No users match">
            Try a different search or status.
          </Empty>
        </div>
      ) : (
        <Table.ScrollContainer minWidth={760}>
          <Table verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Username</Table.Th>
                <Table.Th>Email</Table.Th>
                <Table.Th>Roles</Table.Th>
                <Table.Th>Departments</Table.Th>
                <Table.Th>Two-step</Table.Th>
                <Table.Th>Status</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {shown.map((user) => {
                const status = userStatus(user);
                return (
                  <Table.Tr key={user.id}>
                    <Table.Td>
                      <Anchor
                        component={Link}
                        href={`/users/${user.id}`}
                        className="dax-link"
                      >
                        {user.name}
                      </Anchor>
                    </Table.Td>
                    <Table.Td>
                      {user.username ? <Mono>{user.username}</Mono> : '—'}
                    </Table.Td>
                    <Table.Td>{user.email ?? '—'}</Table.Td>
                    <Table.Td>
                      <div className="dax-chips" style={{ gap: 4 }}>
                        {user.isSuperAdmin && !user.roles.some(isSuperRole) ? (
                          <Pill tone="bad">{SUPER_ADMIN}</Pill>
                        ) : null}
                        {user.roles.map((r) => (
                          <Pill
                            key={r.id}
                            tone={isSuperRole(r) ? 'bad' : 'int'}
                          >
                            {r.name}
                          </Pill>
                        ))}
                        {!user.isSuperAdmin && user.roles.length === 0 ? (
                          <span className="dax-muted">None</span>
                        ) : null}
                      </div>
                    </Table.Td>
                    <Table.Td>
                      {user.departments.map((d) => d.name).join(', ') || '—'}
                    </Table.Td>
                    <Table.Td>
                      {user.twoFactorEnabled ? (
                        <Pill tone="ok">On</Pill>
                      ) : (
                        <Pill>Off</Pill>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Pill tone={STATUS_TONES[status]}>{status}</Pill>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
      {pager}
    </SectionCard>
  );
}
