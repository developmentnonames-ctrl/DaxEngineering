import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { PATH_METADATA } from '@nestjs/common/constants';
import { permissionKeys } from '@dax/contracts';
import { PrismaService } from '@dax/platform-db';
import { IS_AUTHENTICATED, IS_PUBLIC, REQUIRES } from '../auth/session.guard';
import { type Catalog, syncRegistry } from './registry';

export const PLATFORM_CATALOG = Symbol.for('dax.platform-core.catalog');

export interface RouteProblem {
  route: string;
  problem: string;
}

@Injectable()
export class RegistryService implements OnModuleInit {
  private readonly logger = new Logger('Registry');

  constructor(
    @Inject(PLATFORM_CATALOG) readonly catalog: Catalog,
    private readonly prisma: PrismaService,
    private readonly discovery: DiscoveryService,
    private readonly scanner: MetadataScanner,
    private readonly reflector: Reflector,
  ) {}

  async onModuleInit(): Promise<void> {
    const problems = this.auditRoutes();
    if (problems.length) {
      throw new Error(
        `Routes without an access rule:\n  ${problems.map((p) => `${p.route}: ${p.problem}`).join('\n  ')}`,
      );
    }
    const result = await this.prisma.$transaction(
      (tx) => syncRegistry(tx, this.catalog),
      { timeout: 60_000 },
    );
    if (result.changed) {
      this.logger.log(
        {
          newPermissions: result.newPermissions.length,
          removedPermissions: result.removedPermissions,
        },
        'Module registry updated',
      );
    }
  }

  auditRoutes(): RouteProblem[] {
    const known = new Set<string>(
      this.catalog.modules.flatMap((m) => permissionKeys(m)),
    );
    const problems: RouteProblem[] = [];
    for (const wrapper of this.discovery.getControllers()) {
      const instance = wrapper.instance as object | undefined;
      if (!instance) continue;
      const proto = Object.getPrototypeOf(instance) as object;
      for (const name of this.scanner.getAllMethodNames(proto)) {
        const handler = (proto as Record<string, unknown>)[name] as () => void;
        if (Reflect.getMetadata(PATH_METADATA, handler) === undefined) continue;
        const targets = [handler, wrapper.metatype as () => void];
        const route = `${wrapper.name}.${name}`;
        const isPublic = this.reflector.getAllAndOverride<boolean>(
          IS_PUBLIC,
          targets,
        );
        const isAuth = this.reflector.getAllAndOverride<boolean>(
          IS_AUTHENTICATED,
          targets,
        );
        const requires = this.reflector.getAllAndOverride<string>(
          REQUIRES,
          targets,
        );
        if (!isPublic && !isAuth && !requires) {
          problems.push({
            route,
            problem: 'needs @Public(), @Authenticated() or @Requires()',
          });
        } else if (requires && !known.has(requires)) {
          problems.push({ route, problem: `unknown permission "${requires}"` });
        }
      }
    }
    return problems;
  }
}
