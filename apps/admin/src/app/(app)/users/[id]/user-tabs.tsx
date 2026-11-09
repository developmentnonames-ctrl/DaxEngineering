'use client';

import { Tabs } from '@mantine/core';
import type { ReactNode } from 'react';
import { USER_TABS, type UserTab } from './tabs';

const LABELS: Record<UserTab, string> = {
  profile: 'Profile',
  access: 'Access',
  overrides: 'Overrides',
  effective: 'Effective access',
};

export function UserTabs({
  initial,
  ...panels
}: { initial: UserTab } & Record<UserTab, ReactNode>) {
  return (
    <Tabs defaultValue={initial}>
      <Tabs.List>
        {USER_TABS.map((t) => (
          <Tabs.Tab key={t} value={t}>
            {LABELS[t]}
          </Tabs.Tab>
        ))}
      </Tabs.List>
      {USER_TABS.map((t) => (
        <Tabs.Panel key={t} value={t} pt="md">
          {panels[t]}
        </Tabs.Panel>
      ))}
    </Tabs>
  );
}
