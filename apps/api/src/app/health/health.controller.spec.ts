import { ServiceUnavailableException } from '@nestjs/common';
import type { PrismaService } from '@dax/platform-db';
import { describe, expect, it } from 'vitest';
import { HealthController } from './health.controller';

const controller = (up: boolean) =>
  new HealthController({ ping: async () => up } as unknown as PrismaService);

describe('HealthController', () => {
  it('is live without touching the database', () => {
    expect(controller(false).live()).toEqual({ status: 'ok' });
  });

  it('is ready only when the database answers', async () => {
    await expect(controller(true).ready()).resolves.toEqual({
      status: 'ok',
      checks: { database: 'up' },
    });
    await expect(controller(false).ready()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
