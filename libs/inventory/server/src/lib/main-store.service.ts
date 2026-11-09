import { Injectable } from '@nestjs/common';
import { PrismaService } from '@dax/platform-db';

export const MAIN_STORE_CODE = 'MAIN';

@Injectable()
export class MainStore {
  private cached: Promise<string> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  id(): Promise<string> {
    if (!this.cached) {
      this.cached = this.load().catch((error: unknown) => {
        this.cached = null;
        throw error;
      });
    }
    return this.cached;
  }

  private async load(): Promise<string> {
    const store = await this.prisma.store.findUnique({
      where: { code: MAIN_STORE_CODE },
      select: { id: true },
    });
    if (!store)
      throw new Error(
        'The main store is missing. Run the database migrations.',
      );
    return store.id;
  }
}
