import type { AdminUser } from '@dax/platform-contract';

type Scope = 'OWN' | 'DEPARTMENT' | 'ALL';
type Tier = 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED';

export const SCOPE_LABELS: Record<Scope, string> = {
  OWN: 'Own',
  DEPARTMENT: 'Department',
  ALL: 'All',
};

export const TIER_LABELS: Record<Tier, string> = {
  INTERNAL: 'Internal',
  CONFIDENTIAL: 'Confidential',
  RESTRICTED: 'Restricted',
};

export const TIER_COLORS: Record<Tier, string> = {
  INTERNAL: 'gray',
  CONFIDENTIAL: 'orange',
  RESTRICTED: 'red',
};

const dateTime = new Intl.DateTimeFormat('en-LK', {
  timeZone: 'Asia/Colombo',
  dateStyle: 'medium',
  timeStyle: 'short',
});
const dateOnly = new Intl.DateTimeFormat('en-LK', {
  timeZone: 'Asia/Colombo',
  dateStyle: 'medium',
});

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : dateTime.format(d);
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : dateOnly.format(d);
}

export type UserStatus = 'Active' | 'Invited' | 'Locked' | 'Deactivated';

export function userStatus(
  user: Pick<AdminUser, 'active' | 'lockedUntil' | 'hasPassword'>,
): UserStatus {
  if (!user.active) return 'Deactivated';
  if (user.lockedUntil && new Date(user.lockedUntil) > new Date())
    return 'Locked';
  if (!user.hasPassword) return 'Invited';
  return 'Active';
}

export const STATUS_COLORS: Record<UserStatus, string> = {
  Active: 'green',
  Invited: 'yellow',
  Locked: 'orange',
  Deactivated: 'gray',
};
