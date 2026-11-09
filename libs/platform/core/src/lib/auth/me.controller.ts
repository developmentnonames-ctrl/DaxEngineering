import { Controller, Get, Req } from '@nestjs/common';
import type { MeResponse } from '@dax/platform-contract';
import type { DaxRequest } from './internal-caller';
import { AllowPending, sessionOf } from './session.guard';
import { pendingStep } from './session-user';

@Controller('me')
export class MeController {
  @Get()
  @AllowPending()
  me(@Req() req: DaxRequest): MeResponse {
    const { user, app } = sessionOf(req);
    return {
      user: {
        id: user.id,
        name: user.name,
        username: user.username ?? null,
        email: user.email,
        isSuperAdmin: user.isSuperAdmin === true,
        twoFactorEnabled: user.twoFactorEnabled === true,
      },
      app,
      pending: pendingStep(user),
    };
  }
}
