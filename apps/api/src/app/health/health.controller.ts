import {
  Controller,
  Get,
  HttpCode,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { HealthStatus } from '@dax/contracts';
import { Public } from '@dax/platform-core';
import { PrismaService } from '@dax/platform-db';

@Controller('health')
@Public()
export class HealthController {
  constructor(private readonly db: PrismaService) {}

  @Get('live')
  @HttpCode(200)
  live(): HealthStatus {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready(): Promise<HealthStatus> {
    const database = (await this.db.ping()) ? 'up' : 'down';
    if (database === 'down') {
      throw new ServiceUnavailableException({
        status: 'degraded',
        checks: { database },
      });
    }
    return { status: 'ok', checks: { database } };
  }
}
