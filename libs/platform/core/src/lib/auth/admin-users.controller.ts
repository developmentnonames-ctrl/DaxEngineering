import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Logger,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import {
  type AdminUser,
  type AdminUserList,
  CreateUserInput,
} from '@dax/platform-contract';
import { PrismaService } from '@dax/platform-db';
import { AuthService } from './auth.service';
import type { DaxRequest } from './internal-caller';
import { AdminOnly, sessionOf } from './session.guard';

const SELECT = {
  id: true,
  name: true,
  username: true,
  email: true,
  isSuperAdmin: true,
  active: true,
  twoFactorEnabled: true,
  lockedUntil: true,
  createdAt: true,
  accounts: {
    where: { providerId: 'credential', password: { not: null } },
    select: { id: true },
  },
} as const;

type Row = {
  id: string;
  name: string;
  username: string | null;
  email: string;
  isSuperAdmin: boolean;
  active: boolean;
  twoFactorEnabled: boolean | null;
  lockedUntil: Date | null;
  createdAt: Date;
  accounts: { id: string }[];
};

function toAdminUser(row: Row, now = new Date()): AdminUser {
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    email: row.email,
    isSuperAdmin: row.isSuperAdmin,
    active: row.active,
    twoFactorEnabled: row.twoFactorEnabled === true,
    lockedUntil:
      row.lockedUntil && row.lockedUntil > now
        ? row.lockedUntil.toISOString()
        : null,
    hasPassword: row.accounts.length > 0,
    createdAt: row.createdAt.toISOString(),
  };
}

@Controller('admin/users')
@AdminOnly()
export class AdminUsersController {
  private readonly logger = new Logger('AdminUsers');

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  @Get()
  async list(): Promise<AdminUserList> {
    const rows = await this.prisma.user.findMany({
      select: SELECT,
      orderBy: { name: 'asc' },
    });
    return { users: rows.map((r) => toAdminUser(r)) };
  }

  @Post()
  async create(
    @Req() req: DaxRequest,
    @Body() body: unknown,
  ): Promise<AdminUser> {
    const parsed = CreateUserInput.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: 'Check the highlighted fields.',
        fields: [...new Set(parsed.error.issues.map((i) => i.path.join('.')))],
      });
    }
    const input = parsed.data;
    let row: Row;
    try {
      row = await this.prisma.user.create({
        data: {
          name: input.name,
          email: input.email.toLowerCase(),
          username: input.username.toLowerCase(),
          displayUsername: input.username,
          isSuperAdmin: input.isSuperAdmin,
        },
        select: SELECT,
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new ConflictException({
          code: 'USER_EXISTS',
          message: 'That username or email is already in use.',
        });
      }
      throw error;
    }
    this.logger.log(
      {
        event: 'user_created',
        actorId: sessionOf(req).user.id,
        userId: row.id,
      },
      'User created',
    );
    await this.auth.sendPasswordLink(
      row.id,
      row.isSuperAdmin ? 'admin' : 'web',
      'invite',
    );
    return toAdminUser(row);
  }

  @Post(':id/unlock')
  @HttpCode(204)
  async unlock(
    @Req() req: DaxRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.mustExist(id);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { failedLoginCount: 0, lockedUntil: null },
      }),
      this.prisma.twoFactor.updateMany({
        where: { userId: id },
        data: { failedVerificationCount: 0, lockedUntil: null },
      }),
    ]);
    this.logger.log(
      { event: 'user_unlocked', actorId: sessionOf(req).user.id, userId: id },
      'User unlocked',
    );
  }

  @Post(':id/deactivate')
  @HttpCode(204)
  async deactivate(
    @Req() req: DaxRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    if (id === sessionOf(req).user.id) {
      throw new BadRequestException({
        code: 'CANNOT_DEACTIVATE_SELF',
        message: "You can't deactivate your own account.",
      });
    }
    await this.mustExist(id);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { active: false } }),
      this.prisma.session.deleteMany({ where: { userId: id } }),
    ]);
    this.logger.log(
      {
        event: 'user_deactivated',
        actorId: sessionOf(req).user.id,
        userId: id,
      },
      'User deactivated',
    );
  }

  @Post(':id/activate')
  @HttpCode(204)
  async activate(
    @Req() req: DaxRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.mustExist(id);
    await this.prisma.user.update({ where: { id }, data: { active: true } });
    this.logger.log(
      { event: 'user_activated', actorId: sessionOf(req).user.id, userId: id },
      'User activated',
    );
  }

  @Post(':id/password-link')
  @HttpCode(204)
  async passwordLink(
    @Req() req: DaxRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    const user = await this.mustExist(id);
    await this.auth.sendPasswordLink(
      id,
      user.isSuperAdmin ? 'admin' : 'web',
      user.hasPassword ? 'reset' : 'invite',
    );
    this.logger.log(
      {
        event: 'password_link_sent',
        actorId: sessionOf(req).user.id,
        userId: id,
      },
      'Password link sent',
    );
  }

  private async mustExist(id: string): Promise<AdminUser> {
    const row = await this.prisma.user.findUnique({
      where: { id },
      select: SELECT,
    });
    if (!row) throw new NotFoundException();
    return toAdminUser(row);
  }
}
