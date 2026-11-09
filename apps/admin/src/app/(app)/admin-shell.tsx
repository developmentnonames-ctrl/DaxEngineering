'use client';

import {
  AppShell,
  Burger,
  Divider,
  Group,
  NavLink,
  Stack,
  Text,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { SignOutButton } from '@dax/web-shell';

interface MenuEntry {
  key: string;
  label: string;
  path: string;
}

function isActive(pathname: string, path: string): boolean {
  return pathname === path || pathname.startsWith(`${path}/`);
}

export function AdminShell({
  product,
  userName,
  menu,
  children,
}: {
  product: string;
  userName: string;
  menu: MenuEntry[];
  children: ReactNode;
}) {
  const [opened, { toggle, close }] = useDisclosure();
  const pathname = usePathname();

  const link = (entry: MenuEntry) => (
    <NavLink
      key={entry.key}
      component={Link}
      href={entry.path}
      label={entry.label}
      active={isActive(pathname, entry.path)}
      onClick={close}
    />
  );

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 220, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <Burger
              opened={opened}
              onClick={toggle}
              hiddenFrom="sm"
              size="sm"
              aria-label="Open menu"
            />
            <Text fw={700}>{product}</Text>
          </Group>
          <Group gap="sm" wrap="nowrap">
            <Text size="sm" c="dimmed" visibleFrom="xs" truncate>
              {userName}
            </Text>
            <SignOutButton />
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p="xs">
        <Stack gap={2}>
          {menu.map(link)}
          <Divider my="xs" />
          {link({
            key: 'security',
            label: 'My security',
            path: '/account/security',
          })}
        </Stack>
      </AppShell.Navbar>
      <AppShell.Main>
        <Stack gap="lg" maw={1200}>
          {children}
        </Stack>
      </AppShell.Main>
    </AppShell>
  );
}
