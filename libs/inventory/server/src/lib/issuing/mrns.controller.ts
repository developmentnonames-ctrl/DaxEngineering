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
  type IssuingSummary,
  MrnAllocate,
  type MrnDto,
  MrnInput,
  type MrnPage,
  MrnQuery,
  MrnShortClose,
  MrnTransition,
  MrnUpdate,
} from '@dax/inventory-contract';
import { type DaxRequest, Requires, sessionOf } from '@dax/platform-core';
import { parse } from '../common';
import { MrnsService } from './mrns.service';

@Controller('inventory/mrns')
export class MrnsController {
  constructor(private readonly mrns: MrnsService) {}

  @Get()
  @Requires('inventory.mrn.view')
  list(@Req() req: DaxRequest, @Query() query: unknown): Promise<MrnPage> {
    return this.mrns.list(sessionOf(req).policy, parse(MrnQuery, query));
  }

  @Get(':id')
  @Requires('inventory.mrn.view')
  get(
    @Req() req: DaxRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<MrnDto> {
    return this.mrns.detail(sessionOf(req).policy, id);
  }

  @Post()
  @Requires('inventory.mrn.create')
  create(@Req() req: DaxRequest, @Body() body: unknown): Promise<MrnDto> {
    return this.mrns.create(sessionOf(req).policy, parse(MrnInput, body));
  }

  @Patch(':id')
  @Requires('inventory.mrn.create')
  update(
    @Req() req: DaxRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<MrnDto> {
    return this.mrns.update(sessionOf(req).policy, id, parse(MrnUpdate, body));
  }

  @Post(':id/submit')
  @Requires('inventory.mrn.create')
  submit(
    @Req() req: DaxRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<MrnDto> {
    const { version } = parse(MrnTransition, body);
    return this.mrns.submit(sessionOf(req).policy, id, version);
  }

  @Post(':id/check')
  @Requires('inventory.mrn.check')
  check(
    @Req() req: DaxRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<MrnDto> {
    const { version } = parse(MrnTransition, body);
    return this.mrns.check(sessionOf(req).policy, id, version);
  }

  @Post(':id/allocate')
  @Requires('inventory.mrn.allocate')
  allocate(
    @Req() req: DaxRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<MrnDto> {
    return this.mrns.allocate(
      sessionOf(req).policy,
      id,
      parse(MrnAllocate, body),
    );
  }

  @Post(':id/cancel')
  @Requires('inventory.mrn.cancel')
  cancel(
    @Req() req: DaxRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<MrnDto> {
    const { version } = parse(MrnTransition, body);
    return this.mrns.cancel(sessionOf(req).policy, id, version);
  }

  @Post(':id/short-close')
  @Requires('inventory.mrn.short_close')
  shortClose(
    @Req() req: DaxRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<MrnDto> {
    return this.mrns.shortClose(
      sessionOf(req).policy,
      id,
      parse(MrnShortClose, body),
    );
  }
}

@Controller('inventory/issuing')
export class IssuingSummaryController {
  constructor(private readonly mrns: MrnsService) {}

  @Get('summary')
  @Requires('inventory.mrn.view')
  summary(@Req() req: DaxRequest): Promise<IssuingSummary> {
    return this.mrns.summary(sessionOf(req).policy);
  }
}
