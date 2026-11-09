import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  StreamableFile,
} from '@nestjs/common';
import type { ImportResult } from '@dax/contracts';
import {
  BarcodeInput,
  ITEM_CSV_COLUMNS,
  ITEM_CSV_MAX_BYTES,
  type ItemDetail,
  ItemInput,
  type ItemPage,
  ItemQuery,
  ItemStatusInput,
  ItemUpdate,
  SupersedeInput,
} from '@dax/inventory-contract';
import { type DaxRequest, Requires, sessionOf } from '@dax/platform-core';
import { z } from 'zod';
import { parse } from './common';
import { ItemsService } from './items.service';
import { CSV_TYPES, readTextBody } from './text-body';

const ImportQuery = z.object({
  dryRun: z.enum(['true', 'false']).default('true'),
});

function bodyKeys(body: unknown): Set<string> {
  return new Set(
    body && typeof body === 'object' && !Array.isArray(body)
      ? Object.keys(body)
      : [],
  );
}

@Controller('inventory/items')
export class ItemsController {
  constructor(private readonly items: ItemsService) {}

  @Get()
  @Requires('inventory.item.view')
  list(@Query() query: unknown): Promise<ItemPage> {
    return this.items.list(parse(ItemQuery, query));
  }

  @Get('import/template')
  @Requires('inventory.item.import')
  @Header('Cache-Control', 'no-store')
  template(): StreamableFile {
    return new StreamableFile(
      Buffer.from(`${ITEM_CSV_COLUMNS.join(',')}\r\n`, 'utf8'),
      {
        type: 'text/csv; charset=utf-8',
        disposition: 'attachment; filename="items-template.csv"',
      },
    );
  }

  @Post('import')
  @Requires('inventory.item.import')
  async import(
    @Req() req: DaxRequest,
    @Query() query: unknown,
  ): Promise<ImportResult> {
    const { dryRun } = parse(ImportQuery, query);
    const text = await readTextBody(req, {
      limit: ITEM_CSV_MAX_BYTES,
      types: CSV_TYPES,
    });
    return this.items.import(sessionOf(req).policy, text, dryRun === 'true');
  }

  @Get(':id')
  @Requires('inventory.item.view')
  get(
    @Req() req: DaxRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ItemDetail> {
    return this.items.detail(sessionOf(req).policy, id);
  }

  @Post()
  @Requires('inventory.item.create')
  create(@Req() req: DaxRequest, @Body() body: unknown): Promise<ItemDetail> {
    return this.items.create(sessionOf(req).policy, parse(ItemInput, body));
  }

  @Patch(':id')
  @Requires('inventory.item.edit')
  update(
    @Req() req: DaxRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<ItemDetail> {
    return this.items.update(
      sessionOf(req).policy,
      id,
      parse(ItemUpdate, body),
      bodyKeys(body),
    );
  }

  @Post(':id/status')
  @Requires('inventory.item.archive')
  status(
    @Req() req: DaxRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<ItemDetail> {
    return this.items.setStatus(
      sessionOf(req).policy,
      id,
      parse(ItemStatusInput, body),
    );
  }

  @Put(':id/supersession')
  @Requires('inventory.item.edit')
  supersede(
    @Req() req: DaxRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<ItemDetail> {
    return this.items.supersede(
      sessionOf(req).policy,
      id,
      parse(SupersedeInput, body),
    );
  }

  @Post(':id/barcodes')
  @Requires('inventory.item.edit')
  addBarcode(
    @Req() req: DaxRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<ItemDetail> {
    return this.items.addBarcode(
      sessionOf(req).policy,
      id,
      parse(BarcodeInput, body),
    );
  }

  @Delete(':id/barcodes/:barcodeId')
  @Requires('inventory.item.edit')
  removeBarcode(
    @Req() req: DaxRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('barcodeId', ParseUUIDPipe) barcodeId: string,
  ): Promise<ItemDetail> {
    return this.items.removeBarcode(sessionOf(req).policy, id, barcodeId);
  }
}
