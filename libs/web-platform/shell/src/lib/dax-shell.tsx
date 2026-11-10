'use client';

import {
  Menu,
  MenuDivider,
  MenuDropdown,
  MenuItem,
  MenuLabel,
  MenuTarget,
  useMantineColorScheme,
} from '@mantine/core';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { authClient } from './auth-client';
import { Icon } from './icon';
import { DaxLogo } from './logo';
import { clearOfflineData } from './pwa';

export interface ShellNavTab {
  key: string;
  label: string;
  path: string;
}

export interface ShellNavItem extends ShellNavTab {
  icon: string;
  tabs?: ShellNavTab[];
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '?';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

const AVATAR_COLOURS = [
  '#1f7ae0',
  '#d4680a',
  '#b0335a',
  '#1d9a60',
  '#7b4fd6',
  '#0e7c86',
];

export function avatarColour(seed: string): string {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) | 0;
  return AVATAR_COLOURS[Math.abs(h) % AVATAR_COLOURS.length] as string;
}

function isActive(pathname: string, path: string): boolean {
  if (path === '/') return pathname === '/';
  return pathname === path || pathname.startsWith(`${path}/`);
}

async function signOut() {
  await authClient.signOut();
  await clearOfflineData();
  window.location.assign('/login');
}

export function DaxShell({
  appLabel,
  userName,
  userNote,
  nav,
  actions,
  securityPath = '/account/security',
  children,
}: {
  appLabel: string;
  userName: string;
  userNote?: string;
  nav: ShellNavItem[];
  actions?: ReactNode;
  securityPath?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const match = nav
    .flatMap((item) => (item.tabs ?? [item]).map((tab) => ({ item, tab })))
    .filter(({ tab }) => isActive(pathname, tab.path))
    .sort((a, b) => b.tab.path.length - a.tab.path.length)[0];
  const current = match?.item;
  const tabs = current?.tabs && current.tabs.length > 1 ? current.tabs : null;

  return (
    <div>
      <header className="dax-top">
        <Link href="/" className="dax-brand" aria-label="DAX Engineering home">
          <DaxLogo />
        </Link>
        <span className="dax-app-pill">{appLabel}</span>
        <div className="dax-top-actions">
          {actions}
          <Menu position="bottom-end" radius="lg" shadow="xl" width={230}>
            <MenuTarget>
              <button
                type="button"
                className="dax-me"
                aria-label="Account menu"
              >
                <span
                  className="dax-av"
                  style={{ ['--av' as string]: avatarColour(userName) }}
                >
                  {initials(userName)}
                </span>
                <div>
                  <b>{userName}</b>
                  {userNote ? <span>{userNote}</span> : null}
                </div>
              </button>
            </MenuTarget>
            <MenuDropdown>
              <MenuLabel>{userName}</MenuLabel>
              <MenuItem
                component={Link}
                href={securityPath}
                leftSection={<Icon name="lock" size={18} />}
              >
                Password and two-step sign-in
              </MenuItem>
              <MenuItem
                leftSection={
                  <Icon
                    name={colorScheme === 'dark' ? 'sun' : 'moon'}
                    size={18}
                  />
                }
                onClick={() =>
                  setColorScheme(colorScheme === 'dark' ? 'light' : 'dark')
                }
              >
                {colorScheme === 'dark' ? 'Light theme' : 'Dark theme'}
              </MenuItem>
              <MenuDivider />
              <MenuItem
                color="red"
                leftSection={<Icon name="logout" size={18} />}
                onClick={() => void signOut()}
              >
                Sign out
              </MenuItem>
            </MenuDropdown>
          </Menu>
        </div>
      </header>
      <div className="dax-shell">
        <nav className="dax-rail" aria-label="Screens">
          {nav.map((item) => (
            <Link
              key={item.key}
              href={item.path}
              aria-label={item.label}
              aria-current={current?.key === item.key ? 'page' : undefined}
            >
              <Icon name={item.icon} />
              <span className="tip" aria-hidden="true">
                {item.label}
              </span>
            </Link>
          ))}
        </nav>
        <main className="dax-main">
          {tabs ? (
            <nav className="dax-tabs" aria-label={current?.label}>
              {tabs.map((tab) => (
                <Link
                  key={tab.key}
                  href={tab.path}
                  aria-current={match?.tab.key === tab.key ? 'page' : undefined}
                >
                  {tab.label}
                </Link>
              ))}
            </nav>
          ) : null}
          {children}
        </main>
      </div>
    </div>
  );
}
