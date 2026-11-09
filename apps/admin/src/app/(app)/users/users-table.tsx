'use client';

import { Anchor, Table, TextInput } from '@mantine/core';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { type AdminUser, SEEDED_ROLES } from '@dax/platform-contract';
import { Empty, Icon, Mono, Pill, SectionCard } from '@dax/web-shell';
import { STATUS_TONES, type UserStatus, userStatus } from '../../../lib/format';

const SUPER_ADMIN = SEEDED_ROLES.super_admin.name;
const isSuperRole = (r: { isSuperAdmin: boolean }) => r.isSuperAdmin;
const FILTERS: { value: UserStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'Active', label: 'Active' },
  { value: 'Invited', label: 'Awaiting password' },
  { value: 'Locked', label: 'Locked' },
  { value: 'Deactivated', label: 'Deactivated' },
];

function matches(user: AdminUser, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [user.name, user.username ?? '', user.email ?? ''].some((v) =>
    v.toLowerCase().includes(q),
  );
}

export function UsersTable({ users }: { users: AdminUser[] }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<UserStatus | 'all'>('all');
  const shown = useMemo(
    () =>
      users.filter(
        (u) =>
          matches(u, query) && (filter === 'all' || userStatus(u) === filter),
      ),
    [users, query, filter],
  );

  return (
    <SectionCard
      flush
      title="People"
      note={`${shown.length} of ${users.length} shown`}
      toolbar={
        <>
          <TextInput
            placeholder="Search by name, username or email"
            aria-label="Search users"
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            radius="xl"
            leftSection={<Icon name="search" size={18} />}
            maw={460}
          />
          <div className="dax-chips" role="group" aria-label="Status">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                aria-pressed={filter === f.value}
                onClick={() => setFilter(f.value)}
              >
                {f.label}
              </button>
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
    </SectionCard>
  );
}
