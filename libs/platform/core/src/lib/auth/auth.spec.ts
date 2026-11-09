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
import { AdminOnly, AllowPending, Public, SessionGuard } from './session.guard';
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
  it('asks for a password change first, then 2FA for super admins', () => {
    expect(
      pendingStep({ ...base, mustChangePassword: true, isSuperAdmin: true }),
    ).toBe('change_password');
    expect(pendingStep({ ...base, isSuperAdmin: true })).toBe('setup_2fa');
    expect(
      pendingStep({ ...base, isSuperAdmin: true, twoFactorEnabled: true }),
    ).toBeNull();
    expect(pendingStep(base)).toBeNull();
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
    @AllowPending() me() {
      return;
    }
    @AdminOnly() admin() {
      return;
    }
  }

  function guardFor(session: Awaited<ReturnType<AuthService['getSession']>>) {
    const auth = {
      getSession: vi.fn(async () => session),
    } as unknown as AuthService;
    return new SessionGuard(new Reflector(), auth);
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

  const user: SessionUser = {
    id: 'u1',
    name: 'A',
    email: 'a@b.co',
    active: true,
  };
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

  it('denies by default when there is no session', async () => {
    await expect(
      guardFor(null).canActivate(ctx('plain').context),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a session created by the other app', async () => {
    const { context } = ctx('plain', 'admin');
    await expect(
      guardFor(session({ isSuperAdmin: true }, 'web')).canActivate(context),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects deactivated users', async () => {
    await expect(
      guardFor(session({ active: false })).canActivate(ctx('plain').context),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('holds users with pending setup on the setup routes', async () => {
    const pending = session({ mustChangePassword: true });
    await expect(
      guardFor(pending).canActivate(ctx('plain').context),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const { context, req } = ctx('me');
    await expect(guardFor(pending).canActivate(context)).resolves.toBe(true);
    expect(req.auth?.user.id).toBe('u1');
  });

  it('keeps admin routes to super admins on the admin app', async () => {
    await expect(
      guardFor(session()).canActivate(ctx('admin', 'web').context),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      guardFor(
        session({ isSuperAdmin: true, twoFactorEnabled: true }, 'admin'),
      ).canActivate(ctx('admin', 'admin').context),
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
