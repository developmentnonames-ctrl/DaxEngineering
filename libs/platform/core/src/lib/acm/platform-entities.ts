import type { Prisma } from '@dax/platform-db';
import { defineEntity } from './entity';

type UserField = keyof typeof Prisma.UserScalarFieldEnum;

export const userEntity = defineEntity<UserField>({
  key: 'core.user',
  moduleKey: 'core',
  label: 'User accounts',
  table: 'auth.user',
  fields: {
    id: { label: 'ID', tier: 'INTERNAL', locked: true },
    name: { label: 'Name', tier: 'INTERNAL', locked: true, writable: true },
    username: {
      label: 'Username',
      tier: 'INTERNAL',
      writable: true,
      filterable: true,
    },
    email: {
      label: 'Email',
      tier: 'CONFIDENTIAL',
      writable: true,
      group: 'Contact',
    },
    emailVerified: { label: 'Email verified', tier: 'INTERNAL' },
    image: { label: 'Photo', tier: 'INTERNAL' },
    displayUsername: { label: 'Display username', tier: 'INTERNAL' },
    twoFactorEnabled: {
      label: 'Two-step sign-in',
      tier: 'INTERNAL',
      group: 'Security',
    },
    isSuperAdmin: { label: 'Super admin', tier: 'INTERNAL', group: 'Security' },
    active: { label: 'Active', tier: 'INTERNAL', locked: true },
    mustChangePassword: {
      label: 'Must change password',
      tier: 'INTERNAL',
      group: 'Security',
    },
    failedLoginCount: {
      label: 'Failed sign-ins',
      tier: 'INTERNAL',
      group: 'Security',
    },
    lockedUntil: { label: 'Locked until', tier: 'INTERNAL', group: 'Security' },
    createdAt: { label: 'Created', tier: 'INTERNAL', locked: true },
    updatedAt: { label: 'Updated', tier: 'INTERNAL' },
  },
});

export const PLATFORM_ENTITIES = [userEntity];
