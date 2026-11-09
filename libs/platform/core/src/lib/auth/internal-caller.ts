import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { AppName } from '@dax/platform-contract';
import type { SessionUser } from './session-user';

export interface DaxRequest extends Request {
  daxApp?: AppName;
  auth?: {
    sessionId: string;
    user: SessionUser;
  };
}

export const INTERNAL_TOKEN_HEADER = 'x-internal-token';

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

export function resolveCaller(
  token: string | undefined,
  tokens: Record<AppName, string>,
): AppName | null {
  if (!token) return null;
  const presented = digest(token);
  let match: AppName | null = null;
  for (const [app, expected] of Object.entries(tokens) as [AppName, string][]) {
    if (timingSafeEqual(presented, digest(expected))) match = app;
  }
  return match;
}

export function internalCaller(options: {
  tokens: Record<AppName, string>;
  openPaths: string[];
}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (options.openPaths.some((p) => req.path === p)) return next();
    const header = req.headers[INTERNAL_TOKEN_HEADER];
    const app = resolveCaller(
      typeof header === 'string' ? header : undefined,
      options.tokens,
    );
    if (!app) {
      res.status(401).end();
      return;
    }
    (req as DaxRequest).daxApp = app;
    next();
  };
}
