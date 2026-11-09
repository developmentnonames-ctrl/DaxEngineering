import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service';
import type { DaxRequest } from './internal-caller';
import { pendingStep } from './session-user';

const IS_PUBLIC = 'dax:public';
const ALLOW_PENDING = 'dax:allow-pending';
const ADMIN_ONLY = 'dax:admin-only';

export const Public = () => SetMetadata(IS_PUBLIC, true);
export const AllowPending = () => SetMetadata(ALLOW_PENDING, true);
export const AdminOnly = () => SetMetadata(ADMIN_ONLY, true);

export function sessionOf(req: DaxRequest) {
  if (!req.auth || !req.daxApp) throw new UnauthorizedException();
  return { ...req.auth, app: req.daxApp };
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  private flag(key: string, context: ExecutionContext): boolean {
    return (
      this.reflector.getAllAndOverride<boolean>(key, [
        context.getHandler(),
        context.getClass(),
      ]) === true
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.flag(IS_PUBLIC, context)) return true;
    const req = context.switchToHttp().getRequest<DaxRequest>();
    const session = await this.auth.getSession(req);
    if (!session || session.app !== req.daxApp || !session.user.active) {
      throw new UnauthorizedException();
    }
    req.auth = { sessionId: session.sessionId, user: session.user };

    if (pendingStep(session.user) && !this.flag(ALLOW_PENDING, context)) {
      throw new ForbiddenException({
        code: 'ACCOUNT_SETUP_REQUIRED',
        message: 'Finish setting up your account first.',
      });
    }
    if (
      this.flag(ADMIN_ONLY, context) &&
      (req.daxApp !== 'admin' || !session.user.isSuperAdmin)
    ) {
      throw new ForbiddenException();
    }
    return true;
  }
}
