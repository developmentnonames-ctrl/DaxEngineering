import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { AuthService } from './auth.service';
import {
  internalCaller,
  resolveCaller,
  type DaxRequest,
} from './internal-caller';
import { isLocked, signInIdentifier } from './lockout';
import { passwordLinkEmail, ResendMailer } from './mailer';
import type { Policy } from '../acm/policy';
import type { PolicyService } from '../acm/policy.service';
import type { RequestContext } from '../context/request-context';
import {
  AllowPending,
  AppOnly,
  Authenticated,
  Public,
  Requires,
  SessionGuard,
} from './session.guard';
import { pendingStep, type SessionUser } from './session-user';

const TOKENS = { web: 'w'.repeat(40), admin: 'a'.repeat(40) };

describe('sign-in lockout helpers', () => {
  it('reads the identifier for email and username sign-in only', () => {
    expect(signInIdentifier('/sign-in/email', { email: ' A@B.co ' })).toBe(
      'a@b.co',
    );
    expect(signInIdentifier('/sign-in/username', { username: 'Kasun' })).toBe(
      'kasun',
    );
    expect(signInIdentifier('/sign-out', { email: 'a@b.co' })).toBeNull();
    expect(signInIdentifier('/sign-in/email', { email: '' })).toBeNull();
    expect(signInIdentifier('/sign-in/email', null)).toBeNull();
  });

  it('treats only a future lock time as locked', () => {
    const now = new Date('2026-11-09T10:00:00Z');
    expect(isLocked(new Date('2026-11-09T10:05:00Z'), now)).toBe(true);
    expect(isLocked(new Date('2026-11-09T09:55:00Z'), now)).toBe(false);
    expect(isLocked(null, now)).toBe(false);
  });
});

describe('internal caller', () => {
  it('maps each token to its app and rejects anything else', () => {
    expect(resolveCaller(TOKENS.web, TOKENS)).toBe('web');
    expect(resolveCaller(TOKENS.admin, TOKENS)).toBe('admin');
    expect(resolveCaller('nope', TOKENS)).toBeNull();
    expect(resolveCaller(undefined, TOKENS)).toBeNull();
  });

  function run(path: string, token?: string) {
    const req = {
      path,
      headers: token ? { 'x-internal-token': token } : {},
    } as unknown as Request;
    const res = { status: vi.fn().mockReturnThis(), end: vi.fn() };
    const next = vi.fn();
    internalCaller({ tokens: TOKENS, openPaths: ['/api/health/live'] })(
      req,
      res as unknown as Response,
      next,
    );
    return { req: req as DaxRequest, res, next };
  }

  it('lets health probes through without a token', () => {
    expect(run('/api/health/live').next).toHaveBeenCalled();
  });

  it('blocks calls without a valid token', () => {
    const { res, next } = run('/api/me', 'wrong');
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('tags the request with the calling app', () => {
    const { req, next } = run('/api/me', TOKENS.admin);
    expect(next).toHaveBeenCalled();
    expect(req.daxApp).toBe('admin');
  });
});

describe('pendingStep', () => {
  const base: SessionUser = { id: '1', name: 'A', email: 'a@b.co' };
  it('asks for a password change first, then 2FA when a role requires it', () => {
    expect(pendingStep({ ...base, mustChangePassword: true }, true)).toBe(
      'change_password',
    );
    expect(pendingStep(base, true)).toBe('setup_2fa');
    expect(pendingStep({ ...base, twoFactorEnabled: true }, true)).toBeNull();
    expect(pendingStep(base, false)).toBeNull();
  });
});

describe('SessionGuard', () => {
  class Routes {
    @Public() health() {
      return;
    }
    plain() {
      return;
    }
    @Authenticated() signedIn() {
      return;
    }
    @Authenticated() @AllowPending() me() {
      return;
    }
    @Requires('core.users.view') users() {
      return;
    }
    @Requires('core.users.view') @AppOnly('admin') adminUsers() {
      return;
    }
  }

  const user: SessionUser = {
    id: 'u1',
    name: 'A',
    email: 'a@b.co',
    active: true,
  };

  function policy(permissions: string[], require2fa = false): Policy {
    return {
      userId: 'u1',
      isSuperAdmin: false,
      require2fa,
      departmentIds: [],
      roleIds: [],
      enabledModules: new Set(['core']),
      permissions: new Map(
        permissions.map((p) => [p, { scope: 'ALL', storeIds: [] }]),
      ),
      sources: new Map(),
      denied: new Set(),
      fields: new Map(),
      validUntil: Date.now() + 60_000,
      version: '1.1',
    };
  }

  function guardFor(
    session: Awaited<ReturnType<AuthService['getSession']>>,
    p: Policy = policy([]),
  ) {
    const auth = {
      getSession: vi.fn(async () => session),
    } as unknown as AuthService;
    const policies = {
      forUser: vi.fn(async () => p),
    } as unknown as PolicyService;
    const context = { set: vi.fn() } as unknown as RequestContext;
    return new SessionGuard(new Reflector(), auth, policies, context);
  }

  function ctx(handler: keyof Routes, app: 'web' | 'admin' = 'web') {
    const req = { daxApp: app } as DaxRequest;
    return {
      req,
      context: {
        getHandler: () => Routes.prototype[handler],
        getClass: () => Routes,
        switchToHttp: () => ({ getRequest: () => req }),
      } as unknown as ExecutionContext,
    };
  }

  const session = (u: Partial<SessionUser> = {}, app = 'web') => ({
    sessionId: 's1',
    app,
    user: { ...user, ...u },
  });

  it('lets public routes through without a session', async () => {
    await expect(
      guardFor(null).canActivate(ctx('health').context),
    ).resolves.toBe(true);
  });

  it('denies routes that declare no access rule, even with a session', async () => {
    await expect(
      guardFor(session()).canActivate(ctx('plain').context),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requires a session', async () => {
    await expect(
      guardFor(null).canActivate(ctx('signedIn').context),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a session created by the other app and deactivated users', async () => {
    await expect(
      guardFor(session({}, 'web')).canActivate(
        ctx('signedIn', 'admin').context,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      guardFor(session({ active: false })).canActivate(ctx('signedIn').context),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('holds users with pending setup on the setup routes', async () => {
    const pending = session({ mustChangePassword: true });
    await expect(
      guardFor(pending).canActivate(ctx('signedIn').context),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const { context, req } = ctx('me');
    await expect(guardFor(pending).canActivate(context)).resolves.toBe(true);
    expect(req.policy?.userId).toBe('u1');
  });

  it('enforces the required permission', async () => {
    await expect(
      guardFor(session()).canActivate(ctx('users').context),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      guardFor(session(), policy(['core.users.view'])).canActivate(
        ctx('users').context,
      ),
    ).resolves.toBe(true);
  });

  it('keeps admin routes to the admin app and to holders of admin access', async () => {
    const p = policy(['core.users.view']);
    await expect(
      guardFor(session(), p).canActivate(ctx('adminUsers', 'web').context),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      guardFor(session({}, 'admin'), p).canActivate(
        ctx('adminUsers', 'admin').context,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      guardFor(
        session({}, 'admin'),
        policy(['core.users.view', 'core.admin.access']),
      ).canActivate(ctx('adminUsers', 'admin').context),
    ).resolves.toBe(true);
  });
});

describe('emails', () => {
  it('escapes the name and includes the one-time link', () => {
    const mail = passwordLinkEmail(
      'invite',
      { email: 'a@b.co', name: '<b>Kasun</b>' },
      'https://app.example.test/reset-password?token=abc',
      '72 hours',
    );
    expect(mail.to).toBe('a@b.co');
    expect(mail.html).toContain('&lt;b&gt;Kasun&lt;/b&gt;');
    expect(mail.text).toContain(
      'https://app.example.test/reset-password?token=abc',
    );
    expect(mail.subject).toBe('Your DAX account is ready');
  });

  it('sends through Resend and reports failures', async () => {
    const fetchFn = vi.fn(async () => new Response('{}', { status: 200 }));
    const mailer = new ResendMailer(
      'key',
      'DAX <no-reply@example.test>',
      fetchFn,
    );
    await mailer.send({ to: 'a@b.co', subject: 'S', text: 'T', html: 'H' });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe('https://api.resend.com/emails');
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer key');
    expect(JSON.parse(String(init.body))).toMatchObject({
      to: ['a@b.co'],
      subject: 'S',
    });

    const failing = new ResendMailer(
      'key',
      'from',
      vi.fn(async () => new Response('', { status: 422 })),
    );
    await expect(
      failing.send({ to: 'a@b.co', subject: 'S', text: 'T', html: 'H' }),
    ).rejects.toThrow('422');
  });
});
