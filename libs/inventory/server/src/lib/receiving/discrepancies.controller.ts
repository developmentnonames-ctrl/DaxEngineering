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
  DiscrepancyClose,
  type DiscrepancyDto,
  DiscrepancyNotes,
  type DiscrepancyPage,
  DiscrepancyQuery,
} from '@dax/inventory-contract';
import { type DaxRequest, Requires, sessionOf } from '@dax/platform-core';
import { parse } from '../common';
import { DiscrepanciesService } from './discrepancies.service';

@Controller('inventory/discrepancies')
export class DiscrepanciesController {
  constructor(private readonly discrepancies: DiscrepanciesService) {}

  @Get()
  @Requires('inventory.discrepancy.view')
  list(@Query() query: unknown): Promise<DiscrepancyPage> {
    return this.discrepancies.list(parse(DiscrepancyQuery, query));
  }

  @Get(':id')
  @Requires('inventory.discrepancy.view')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<DiscrepancyDto> {
    return this.discrepancies.detail(id);
  }

  @Patch(':id')
  @Requires('inventory.discrepancy.report')
  notes(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<DiscrepancyDto> {
    return this.discrepancies.updateNotes(id, parse(DiscrepancyNotes, body));
  }

  @Post(':id/close')
  @Requires('inventory.discrepancy.close')
  close(
    @Req() req: DaxRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<DiscrepancyDto> {
    return this.discrepancies.close(
      sessionOf(req).policy,
      id,
      parse(DiscrepancyClose, body),
    );
  }
}
