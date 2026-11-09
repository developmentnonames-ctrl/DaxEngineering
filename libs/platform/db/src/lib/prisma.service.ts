import {
  DynamicModule,
  Global,
  Inject,
  Injectable,
  Module,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

export interface DatabaseOptions {
  url: string;
  applicationName: string;
  poolMax?: number;
}

export const DATABASE_OPTIONS = Symbol.for('dax.platform-db.options');

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(DATABASE_OPTIONS) options: DatabaseOptions) {
    super({
      adapter: new PrismaPg({
        connectionString: options.url,
        application_name: options.applicationName,
        max: options.poolMax ?? 10,
      }),
    });
  }

  async ping(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

@Global()
@Module({})
export class DatabaseModule {
  static forRoot(options: DatabaseOptions): DynamicModule {
    return {
      module: DatabaseModule,
      providers: [
        { provide: DATABASE_OPTIONS, useValue: options },
        PrismaService,
      ],
      exports: [PrismaService],
    };
  }
}
