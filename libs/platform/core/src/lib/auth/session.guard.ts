import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AppName } from '@dax/platform-contract';
import { can } from '../acm/policy';
import { PolicyService } from '../acm/policy.service';
import { RequestContext } from '../context/request-context';
import { AuthService } from './auth.service';
import type { DaxRequest } from './internal-caller';
import { pendingStep } from './session-user';

export const IS_PUBLIC = 'dax:public';
export const IS_AUTHENTICATED = 'dax:authenticated';
export const REQUIRES = 'dax:requires';
export const ALLOW_PENDING = 'dax:allow-pending';
export const APP_ONLY = 'dax:app-only';

export const Public = () => SetMetadata(IS_PUBLIC, true);
export const Authenticated = () => SetMetadata(IS_AUTHENTICATED, true);
export const Requires = (permission: string) =>
  SetMetadata(REQUIRES, permission);
export const AllowPending = () => SetMetadata(ALLOW_PENDING, true);
export const AppOnly = (app: AppName) => SetMetadata(APP_ONLY, app);

export function sessionOf(req: DaxRequest) {
  if (!req.auth || !req.daxApp || !req.policy)
    throw new UnauthorizedException();
  return { ...req.auth, app: req.daxApp, policy: req.policy };
}

function denied(): never {
  throw new ForbiddenException({
    code: 'PERMISSION_DENIED',
    message: "You don't have access to this.",
  });
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
    private readonly policies: PolicyService,
    private readonly context: RequestContext,
  ) {}

  private meta<T>(key: string, context: ExecutionContext): T | undefined {
    return this.reflector.getAllAndOverride<T>(key, [
      context.getHandler(),
      context.getClass(),
    ]);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.meta<boolean>(IS_PUBLIC, context)) return true;
    const requires = this.meta<string>(REQUIRES, context);
    if (!requires && !this.meta<boolean>(IS_AUTHENTICATED, context)) denied();

    const req = context.switchToHttp().getRequest<DaxRequest>();
    const session = await this.auth.getSession(req);
    if (!session || session.app !== req.daxApp || !session.user.active) {
      throw new UnauthorizedException();
    }
    const policy = await this.policies.forUser(session.user.id);
    req.auth = { sessionId: session.sessionId, user: session.user };
    req.policy = policy;
    this.context.set({
      actor: { id: session.user.id, name: session.user.name },
      policy,
      app: req.daxApp,
    });

    const allowPending = this.meta<boolean>(ALLOW_PENDING, context) === true;
    if (pendingStep(session.user, policy.require2fa) && !allowPending) {
      throw new ForbiddenException({
        code: 'ACCOUNT_SETUP_REQUIRED',
        message: 'Finish setting up your account first.',
      });
    }
    const onlyApp = this.meta<AppName>(APP_ONLY, context);
    if (onlyApp && req.daxApp !== onlyApp) denied();
    if (
      req.daxApp === 'admin' &&
      !allowPending &&
      !can(policy, 'core.admin.access')
    ) {
      denied();
    }
    if (requires && !can(policy, requires)) denied();
    return true;
  }
}
