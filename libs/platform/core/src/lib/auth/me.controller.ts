import { Controller, Get, Req } from '@nestjs/common';
import {
  type Capabilities,
  CORE_MODULE_KEY,
  type MeResponse,
} from '@dax/platform-contract';
import { can } from '../acm/policy';
import { RegistryService } from '../acm/registry.service';
import type { DaxRequest } from './internal-caller';
import { AllowPending, Authenticated, sessionOf } from './session.guard';
import { pendingStep } from './session-user';

@Controller('me')
@Authenticated()
@AllowPending()
export class MeController {
  constructor(private readonly registry: RegistryService) {}

  @Get()
  me(@Req() req: DaxRequest): MeResponse {
    const { user, app, policy } = sessionOf(req);
    return {
      user: {
        id: user.id,
        name: user.name,
        username: user.username ?? null,
        email: user.email,
        isSuperAdmin: policy.isSuperAdmin,
        twoFactorEnabled: user.twoFactorEnabled === true,
      },
      app,
      pending: pendingStep(user, policy.require2fa),
    };
  }

  @Get('capabilities')
  capabilities(@Req() req: DaxRequest): Capabilities {
    const { user, app, policy } = sessionOf(req);
    const modules = this.registry.catalog.modules.filter(
      (m) => m.key !== CORE_MODULE_KEY && policy.enabledModules.has(m.key),
    );
    const menuModules =
      app === 'admin'
        ? this.registry.catalog.modules.filter((m) => m.key === CORE_MODULE_KEY)
        : modules;
    return {
      user: { id: user.id, name: user.name },
      app,
      pending: pendingStep(user, policy.require2fa),
      isSuperAdmin: policy.isSuperAdmin,
      modules: modules.map((m) => ({ key: m.key, name: m.name })),
      menu: menuModules.flatMap((m) =>
        (m.menu ?? [])
          .filter((e) => can(policy, e.permission))
          .map((e) => ({
            key: e.key,
            label: e.label,
            path: e.path,
            moduleKey: m.key,
            icon: e.icon ?? null,
          })),
      ),
      permissions: Object.fromEntries(
        [...policy.permissions].map(([k, g]) => [k, g.scope]),
      ),
      fields: Object.fromEntries(
        [...policy.fields].map(([entity, f]) => [
          entity,
          { read: [...f.read].sort(), write: [...f.write].sort() },
        ]),
      ),
      policyVersion: policy.version,
    };
  }
}
