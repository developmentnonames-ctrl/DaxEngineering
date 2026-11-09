import { Controller, Get } from '@nestjs/common';
import type { DepartmentOptions } from '@dax/platform-contract';
import { PrismaService } from '@dax/platform-db';
import { Authenticated } from './session.guard';

@Controller('directory')
@Authenticated()
export class DirectoryController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('departments')
  async departments(): Promise<DepartmentOptions> {
    const rows = await this.prisma.department.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
    return { departments: rows };
  }
}
