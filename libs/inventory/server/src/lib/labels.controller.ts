import {
  Body,
  Controller,
  ForbiddenException,
  Header,
  HttpCode,
  Inject,
  Post,
  Req,
  StreamableFile,
} from '@nestjs/common';
import { LabelRequest, qrUrl } from '@dax/inventory-contract';
import {
  Authenticated,
  AuditService,
  can,
  type DaxRequest,
  PUBLIC_ORIGINS,
  type PublicOrigins,
  sessionOf,
} from '@dax/platform-core';
import { PrismaService } from '@dax/platform-db';
import { invalid, MODULE_KEY, parse } from './common';
import { binEntity, itemEntity } from './entities';
import { type LabelContent, renderLabels, withCopies } from './labels';

const PERMISSION = {
  item: 'inventory.item.print_label',
  bin: 'inventory.location.print_label',
} as const;

@Controller('inventory/labels')
export class LabelsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(PUBLIC_ORIGINS) private readonly origins: PublicOrigins,
  ) {}

  @Post()
  @Authenticated()
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async print(
    @Req() req: DaxRequest,
    @Body() body: unknown,
  ): Promise<StreamableFile> {
    const { policy } = sessionOf(req);
    const input = parse(LabelRequest, body);
    if (!can(policy, PERMISSION[input.kind])) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: "You don't have access to this.",
      });
    }
    const contents =
      input.kind === 'item'
        ? await this.items(input.ids)
        : await this.bins(input.ids);
    const labels = withCopies(contents, input.copies);
    const pdf = await renderLabels(labels, input.skip);
    await this.audit.record({
      moduleKey: MODULE_KEY,
      entityKey: input.kind === 'item' ? itemEntity.key : binEntity.key,
      action: 'labels_printed',
      after: { kind: input.kind, count: labels.length },
    });
    return new StreamableFile(pdf, {
      type: 'application/pdf',
      disposition: 'inline; filename="labels.pdf"',
      length: pdf.length,
    });
  }

  private async items(ids: readonly string[]): Promise<LabelContent[]> {
    const rows = await this.prisma.item.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: {
        id: true,
        partNo: true,
        description: true,
        uom: true,
        qrToken: true,
        brand: { select: { name: true } },
      },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids.map((id): LabelContent => {
      const row = byId.get(id);
      if (!row) invalid('Some of the selected items were not found.', ['ids']);
      return {
        kind: 'item',
        url: qrUrl(this.origins.web, 'item', row.qrToken),
        partNo: row.partNo,
        brand: row.brand.name,
        description: row.description,
        uom: row.uom,
      };
    });
  }

  private async bins(ids: readonly string[]): Promise<LabelContent[]> {
    const rows = await this.prisma.bin.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: {
        id: true,
        code: true,
        kind: true,
        qrToken: true,
        zone: { select: { name: true } },
      },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids.map((id): LabelContent => {
      const row = byId.get(id);
      if (!row) invalid('Some of the selected bins were not found.', ['ids']);
      return {
        kind: 'bin',
        url: qrUrl(this.origins.web, 'bin', row.qrToken),
        code: row.code,
        zone: row.zone.name,
        binKind: row.kind === 'STORAGE' ? null : row.kind,
      };
    });
  }
}
