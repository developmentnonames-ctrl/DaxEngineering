import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { fiscalYearOf, formatDocNumber } from '@dax/util';
import {
  type AdminCatalog,
  DepartmentInput,
  type DepartmentDto,
  type DepartmentList,
  ModuleToggleInput,
  NumberSeriesInput,
  type NumberSeriesDto,
  type NumberSeriesList,
} from '@dax/platform-contract';
import { PrismaService } from '@dax/platform-db';
import { can } from '../acm/policy';
import { AuditService } from '../audit/audit.service';
import type { DaxRequest } from '../auth/internal-caller';
import {
  AppOnly,
  Authenticated,
  Requires,
  sessionOf,
} from '../auth/session.guard';
import { isUniqueViolation, parse } from './common';

export function seriesPreview(
  s: { docType: string; subtype: string; pattern: string; padding: number },
  date = new Date(),
): string {
  return formatDocNumber(
    {
      doc: s.docType,
      sub: s.subtype || undefined,
      fy: fiscalYearOf(date).label,
      seq: 1,
    },
    s.pattern,
    s.padding,
  );
}

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'department'
  );
}

@Controller('admin')
@AppOnly('admin')
export class AdminSettingsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get('catalog')
  @Authenticated()
  async catalog(@Req() req: DaxRequest): Promise<AdminCatalog> {
    const { policy } = sessionOf(req);
    if (
      !['core.roles.view', 'core.modules.view', 'core.users.view'].some((p) =>
        can(policy, p),
      )
    ) {
      throw new NotFoundException();
    }
    const [modules, entities] = await Promise.all([
      this.prisma.module.findMany({
        where: { removedAt: null },
        orderBy: { key: 'asc' },
        select: {
          key: true,
          name: true,
          description: true,
          enabled: true,
          toggleable: true,
          dependsOn: true,
          permissions: {
            where: { removedAt: null },
            orderBy: { key: 'asc' },
          },
        },
      }),
      this.prisma.entity.findMany({
        orderBy: { key: 'asc' },
        select: {
          key: true,
          moduleKey: true,
          label: true,
          fields: { where: { removedAt: null }, orderBy: { name: 'asc' } },
        },
      }),
    ]);
    const features = await this.prisma.feature.findMany({
      where: { removedAt: null },
    });
    return {
      modules: modules.map((m) => ({
        key: m.key,
        name: m.name,
        description: m.description,
        enabled: m.enabled,
        toggleable: m.toggleable,
        dependsOn: m.dependsOn,
        features: features
          .filter((f) => f.moduleKey === m.key)
          .map((f) => ({
            key: f.key,
            name: f.name,
            actions: m.permissions
              .filter((p) => p.featureKey === f.key)
              .map((p) => ({
                permissionKey: p.key,
                action: p.action,
                label: p.label,
                description: p.description,
                scopes: p.scopes,
                isApproval: p.isApproval,
              })),
          })),
      })),
      entities: entities.map((e) => ({
        key: e.key,
        moduleKey: e.moduleKey,
        label: e.label,
        fields: e.fields.map((f) => ({
          id: f.id,
          name: f.name,
          label: f.label,
          tier: f.tier,
          locked: f.locked,
          writable: f.writable,
          encrypted: f.encrypted,
          group: f.group,
        })),
      })),
    };
  }

  @Get('departments')
  @Requires('core.departments.view')
  async departments(): Promise<DepartmentList> {
    const rows = await this.prisma.department.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { members: true } } },
    });
    return {
      departments: rows.map((d): DepartmentDto => ({
        id: d.id,
        key: d.key,
        name: d.name,
        active: d.active,
        memberCount: d._count.members,
      })),
    };
  }

  @Post('departments')
  @Requires('core.departments.manage')
  async createDepartment(@Body() body: unknown): Promise<DepartmentDto> {
    const input = parse(DepartmentInput, body);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const d = await tx.department.create({
          data: {
            key: slug(input.name),
            name: input.name,
            active: input.active,
          },
        });
        await this.audit.record(
          {
            moduleKey: 'core',
            entityKey: 'core.department',
            entityId: d.id,
            action: 'create',
            after: input,
          },
          tx,
        );
        return {
          id: d.id,
          key: d.key,
          name: d.name,
          active: d.active,
          memberCount: 0,
        };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException({
          code: 'DEPARTMENT_EXISTS',
          message: 'A department with that name already exists.',
        });
      }
      throw error;
    }
  }

  @Patch('departments/:id')
  @Requires('core.departments.manage')
  async updateDepartment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<DepartmentDto> {
    const input = parse(DepartmentInput, body);
    const before = await this.prisma.department.findUnique({ where: { id } });
    if (!before)
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Not found.' });
    return this.prisma.$transaction(async (tx) => {
      const d = await tx.department.update({
        where: { id },
        data: { name: input.name, active: input.active },
        include: { _count: { select: { members: true } } },
      });
      await this.audit.record(
        {
          moduleKey: 'core',
          entityKey: 'core.department',
          entityId: id,
          action: 'update',
          before: { name: before.name, active: before.active },
          after: input,
        },
        tx,
      );
      return {
        id: d.id,
        key: d.key,
        name: d.name,
        active: d.active,
        memberCount: d._count.members,
      };
    });
  }

  @Put('modules/:key')
  @Requires('core.modules.manage')
  async toggleModule(
    @Param('key') key: string,
    @Body() body: unknown,
  ): Promise<{ enabled: boolean; restartRequired: boolean }> {
    const { enabled } = parse(ModuleToggleInput, body);
    const modules = await this.prisma.module.findMany({
      where: { removedAt: null },
    });
    const target = modules.find((m) => m.key === key);
    if (!target)
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Unknown module.',
      });
    if (!target.toggleable) {
      throw new BadRequestException({
        code: 'MODULE_LOCKED',
        message: 'This module is always on.',
      });
    }
    if (target.enabled === enabled) return { enabled, restartRequired: false };
    if (enabled) {
      const missing = target.dependsOn.filter(
        (d) => !modules.find((m) => m.key === d)?.enabled,
      );
      if (missing.length) {
        throw new ConflictException({
          code: 'MODULE_DEPENDENCY',
          message: `Turn on ${missing.join(', ')} first.`,
        });
      }
    } else {
      const dependents = modules.filter(
        (m) => m.enabled && m.dependsOn.includes(key),
      );
      if (dependents.length) {
        throw new ConflictException({
          code: 'MODULE_DEPENDENCY',
          message: `Turn off ${dependents.map((m) => m.name).join(', ')} first.`,
        });
      }
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.module.update({ where: { key }, data: { enabled } });
      await this.audit.record(
        {
          moduleKey: 'core',
          entityKey: 'core.module',
          entityId: key,
          action: enabled ? 'enabled' : 'disabled',
        },
        tx,
      );
    });
    return { enabled, restartRequired: true };
  }

  @Get('numbering')
  @Requires('core.numbering.view')
  async numbering(): Promise<NumberSeriesList> {
    const rows = await this.prisma.numberSeries.findMany({
      where: { removedAt: null },
      orderBy: [{ docType: 'asc' }, { subtype: 'asc' }],
    });
    return {
      series: rows.map((s): NumberSeriesDto => ({
        id: s.id,
        moduleKey: s.moduleKey,
        docType: s.docType,
        subtype: s.subtype,
        name: s.name,
        pattern: s.pattern,
        padding: s.padding,
        active: s.active,
        preview: seriesPreview(s),
      })),
    };
  }

  @Patch('numbering/:id')
  @Requires('core.numbering.manage')
  async updateSeries(
    @Req() req: DaxRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<NumberSeriesDto> {
    sessionOf(req);
    const input = parse(NumberSeriesInput, body);
    const before = await this.prisma.numberSeries.findFirst({
      where: { id, removedAt: null },
    });
    if (!before)
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Not found.' });
    if (!before.subtype && input.pattern.includes('{SUB}')) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: 'This document type has no subtypes; remove {SUB}.',
        fields: ['pattern'],
      });
    }
    const s = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.numberSeries.update({
        where: { id },
        data: input,
      });
      await this.audit.record(
        {
          moduleKey: 'core',
          entityKey: 'core.number_series',
          entityId: id,
          action: 'update',
          before: {
            pattern: before.pattern,
            padding: before.padding,
            active: before.active,
          },
          after: input,
        },
        tx,
      );
      return updated;
    });
    return {
      id: s.id,
      moduleKey: s.moduleKey,
      docType: s.docType,
      subtype: s.subtype,
      name: s.name,
      pattern: s.pattern,
      padding: s.padding,
      active: s.active,
      preview: seriesPreview(s),
    };
  }
}
