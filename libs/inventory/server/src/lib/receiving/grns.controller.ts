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
  GrnCreate,
  type GrnDto,
  type GrnPage,
  GrnQuery,
  GrnReverseInput,
  GrnTransition,
  GrnUpdate,
  type ReceivingSummary,
} from '@dax/inventory-contract';
import { type DaxRequest, Requires, sessionOf } from '@dax/platform-core';
import { parse } from '../common';
import { GrnsService } from './grns.service';

@Controller('inventory/grns')
export class GrnsController {
  constructor(private readonly grns: GrnsService) {}

  @Get()
  @Requires('inventory.grn.view')
  list(@Query() query: unknown): Promise<GrnPage> {
    return this.grns.list(parse(GrnQuery, query));
  }

  @Get(':id')
  @Requires('inventory.grn.view')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<GrnDto> {
    return this.grns.detail(id);
  }

  @Post()
  @Requires('inventory.grn.check')
  create(@Req() req: DaxRequest, @Body() body: unknown): Promise<GrnDto> {
    return this.grns.create(sessionOf(req).policy, parse(GrnCreate, body));
  }

  @Patch(':id')
  @Requires('inventory.grn.check')
  update(
    @Req() req: DaxRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<GrnDto> {
    return this.grns.update(sessionOf(req).policy, id, parse(GrnUpdate, body));
  }

  @Post(':id/check')
  @Requires('inventory.grn.check')
  check(
    @Req() req: DaxRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<GrnDto> {
    const { version } = parse(GrnTransition, body);
    return this.grns.check(sessionOf(req).policy, id, version);
  }

  @Post(':id/post')
  @Requires('inventory.grn.post')
  post(
    @Req() req: DaxRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<GrnDto> {
    const { version } = parse(GrnTransition, body);
    return this.grns.post(sessionOf(req).policy, id, version);
  }

  @Post(':id/cancel')
  @Requires('inventory.grn.check')
  cancel(
    @Req() req: DaxRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<GrnDto> {
    const { version } = parse(GrnTransition, body);
    return this.grns.cancel(sessionOf(req).policy, id, version);
  }

  @Post(':id/reverse')
  @Requires('inventory.grn.reverse')
  reverse(
    @Req() req: DaxRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<GrnDto> {
    return this.grns.reverse(
      sessionOf(req).policy,
      id,
      parse(GrnReverseInput, body),
    );
  }
}

@Controller('inventory/receiving')
export class ReceivingSummaryController {
  constructor(private readonly grns: GrnsService) {}

  @Get('summary')
  @Requires('inventory.grn.view')
  summary(): Promise<ReceivingSummary> {
    return this.grns.summary();
  }
}
