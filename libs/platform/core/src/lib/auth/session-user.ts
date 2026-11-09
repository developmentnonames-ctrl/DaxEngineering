import type { PendingStep } from '@dax/platform-contract';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  username?: string | null;
  twoFactorEnabled?: boolean | null;
  isSuperAdmin?: boolean | null;
  active?: boolean | null;
  mustChangePassword?: boolean | null;
}

export function pendingStep(
  user: SessionUser,
  require2fa: boolean,
): PendingStep | null {
  if (user.mustChangePassword) return 'change_password';
  if ((require2fa || user.isSuperAdmin) && !user.twoFactorEnabled) {
    return 'setup_2fa';
  }
  return null;
}
