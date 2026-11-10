import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  WarrantyClose,
  type WarrantyCounts,
  type WarrantyDto,
  type WarrantyPage,
  WarrantyQuery,
  WarrantySend,
  WarrantyTagInput,
  WarrantyTagUpdate,
} from '@dax/inventory-contract';
import { type DaxRequest, Requires, sessionOf } from '@dax/platform-core';
import { parse } from '../common';
import { WarrantyService } from './warranty.service';

@Controller('inventory/warranty')
export class WarrantyController {
  constructor(private readonly service: WarrantyService) {}

  @Get()
  @Requires('inventory.warranty.view')
  list(@Req() req: DaxRequest, @Query() query: unknown): Promise<WarrantyPage> {
    return this.service.list(
      sessionOf(req).policy,
      parse(WarrantyQuery, query),
    );
  }

  @Get('summary')
  @Requires('inventory.warranty.view')
  summary(): Promise<WarrantyCounts> {
    return this.service.counts();
  }

  @Get(':id')
  @Requires('inventory.warranty.view')
  get(
    @Req() req: DaxRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<WarrantyDto> {
    return this.service.detail(sessionOf(req).policy, id);
  }

  @Post()
  @Requires('inventory.warranty.tag')
  create(@Req() req: DaxRequest, @Body() body: unknown): Promise<WarrantyDto> {
    return this.service.create(
      sessionOf(req).policy,
      parse(WarrantyTagInput, body),
    );
  }

  @Patch(':id')
  @Requires('inventory.warranty.tag')
  update(
    @Req() req: DaxRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<WarrantyDto> {
    return this.service.update(
      sessionOf(req).policy,
      id,
      parse(WarrantyTagUpdate, body),
    );
  }

  @Post(':id/send')
  @Requires('inventory.warranty.send')
  send(
    @Req() req: DaxRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<WarrantyDto> {
    return this.service.send(
      sessionOf(req).policy,
      id,
      parse(WarrantySend, body),
    );
  }

  @Post(':id/close')
  @Requires('inventory.warranty.close')
  close(
    @Req() req: DaxRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<WarrantyDto> {
    return this.service.close(
      sessionOf(req).policy,
      id,
      parse(WarrantyClose, body),
    );
  }
}
