'use client';

import { Anchor, Badge, Group, Table, Text, TextInput } from '@mantine/core';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { type AdminUser, SEEDED_ROLES } from '@dax/platform-contract';
import { STATUS_COLORS, userStatus } from '../../../lib/format';

const SUPER_ADMIN = SEEDED_ROLES.super_admin.name;
const isSuperRole = (r: { isSuperAdmin: boolean }) => r.isSuperAdmin;

function matches(user: AdminUser, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [user.name, user.username ?? '', user.email ?? ''].some((v) =>
    v.toLowerCase().includes(q),
  );
}

export function UsersTable({ users }: { users: AdminUser[] }) {
  const [query, setQuery] = useState('');
  const shown = useMemo(
    () => users.filter((u) => matches(u, query)),
    [users, query],
  );

  return (
    <>
      <TextInput
        placeholder="Search by name, username or email"
        aria-label="Search users"
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
        maw={420}
      />
      <Table.ScrollContainer minWidth={760}>
        <Table striped withTableBorder verticalSpacing="sm">
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
                    <Anchor component={Link} href={`/users/${user.id}`}>
                      {user.name}
                    </Anchor>
                  </Table.Td>
                  <Table.Td>{user.username ?? '—'}</Table.Td>
                  <Table.Td>{user.email ?? '—'}</Table.Td>
                  <Table.Td>
                    <Group gap={4}>
                      {user.isSuperAdmin && !user.roles.some(isSuperRole) ? (
                        <Badge color="red" variant="filled">
                          {SUPER_ADMIN}
                        </Badge>
                      ) : null}
                      {user.roles.map((r) => (
                        <Badge
                          key={r.id}
                          color={isSuperRole(r) ? 'red' : undefined}
                          variant={isSuperRole(r) ? 'filled' : 'light'}
                        >
                          {r.name}
                        </Badge>
                      ))}
                      {!user.isSuperAdmin && user.roles.length === 0 ? (
                        <Text size="sm" c="dimmed">
                          None
                        </Text>
                      ) : null}
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    {user.departments.map((d) => d.name).join(', ') || '—'}
                  </Table.Td>
                  <Table.Td>{user.twoFactorEnabled ? 'On' : 'Off'}</Table.Td>
                  <Table.Td>
                    <Badge color={STATUS_COLORS[status]}>{status}</Badge>
                  </Table.Td>
                </Table.Tr>
              );
            })}
            {shown.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={7}>
                  <Text size="sm" c="dimmed">
                    No users match.
                  </Text>
                </Table.Td>
              </Table.Tr>
            ) : null}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </>
  );
}
