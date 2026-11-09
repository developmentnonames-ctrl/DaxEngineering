import type { PrismaService } from '@dax/platform-db';

export interface LockoutStore {
  lockedUntil(identifier: string): Promise<Date | null>;
  recordFailure(
    identifier: string,
    maxFailures: number,
    lockMinutes: number,
  ): Promise<Date | null>;
  reset(identifier: string): Promise<void>;
}

export function signInIdentifier(path: string, body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const field =
    path === '/sign-in/email'
      ? 'email'
      : path === '/sign-in/username'
        ? 'username'
        : null;
  if (!field) return null;
  const value = (body as Record<string, unknown>)[field];
  return typeof value === 'string' && value.trim()
    ? value.trim().toLowerCase()
    : null;
}

export function isLocked(
  until: Date | null,
  now: Date = new Date(),
): until is Date {
  return until !== null && until.getTime() > now.getTime();
}

export class PrismaLockoutStore implements LockoutStore {
  constructor(private readonly prisma: PrismaService) {}

  async lockedUntil(identifier: string): Promise<Date | null> {
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ email: identifier }, { username: identifier }] },
      select: { lockedUntil: true },
    });
    return user?.lockedUntil ?? null;
  }

  async recordFailure(
    identifier: string,
    maxFailures: number,
    lockMinutes: number,
  ): Promise<Date | null> {
    const rows = await this.prisma.$queryRaw<{ locked_until: Date | null }[]>`
      UPDATE auth."user" SET
        failed_login_count = CASE WHEN failed_login_count + 1 >= ${maxFailures}::int
          THEN 0 ELSE failed_login_count + 1 END,
        locked_until = CASE WHEN failed_login_count + 1 >= ${maxFailures}::int
          THEN now() + make_interval(mins => ${lockMinutes}::int) ELSE locked_until END
      WHERE email = ${identifier} OR username = ${identifier}
      RETURNING locked_until`;
    const until = rows[0]?.locked_until ?? null;
    return isLocked(until) ? until : null;
  }

  async reset(identifier: string): Promise<void> {
    await this.prisma.user.updateMany({
      where: {
        OR: [{ email: identifier }, { username: identifier }],
        failedLoginCount: { gt: 0 },
      },
      data: { failedLoginCount: 0, lockedUntil: null },
    });
  }
}
