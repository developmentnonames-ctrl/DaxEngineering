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
  type ReturnableAod,
  ReturnAodQuery,
  type ReturnAodOptions,
  type ReturnDto,
  ReturnInput,
  type ReturnPage,
  ReturnQuery,
  type ReturnsSummary,
  ReturnTransition,
  ReturnUpdate,
} from '@dax/inventory-contract';
import { type DaxRequest, Requires, sessionOf } from '@dax/platform-core';
import { parse } from '../common';
import { ReturnsService } from './returns.service';

@Controller('inventory/return-notes')
export class ReturnsController {
  constructor(private readonly service: ReturnsService) {}

  @Get()
  @Requires('inventory.return_note.view')
  list(@Req() req: DaxRequest, @Query() query: unknown): Promise<ReturnPage> {
    return this.service.list(sessionOf(req).policy, parse(ReturnQuery, query));
  }

  @Get('summary')
  @Requires('inventory.return_note.view')
  summary(): Promise<ReturnsSummary> {
    return this.service.summary();
  }

  @Get('aods')
  @Requires('inventory.return_note.create')
  aods(
    @Req() req: DaxRequest,
    @Query() query: unknown,
  ): Promise<ReturnAodOptions> {
    return this.service.aodOptions(
      sessionOf(req).policy,
      parse(ReturnAodQuery, query),
    );
  }

  @Get('aod/:aodId/returnable')
  @Requires('inventory.return_note.create')
  returnable(
    @Req() req: DaxRequest,
    @Param('aodId', ParseUUIDPipe) aodId: string,
  ): Promise<ReturnableAod> {
    return this.service.returnable(sessionOf(req).policy, aodId);
  }

  @Get(':id')
  @Requires('inventory.return_note.view')
  get(
    @Req() req: DaxRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ReturnDto> {
    return this.service.detail(sessionOf(req).policy, id);
  }

  @Post()
  @Requires('inventory.return_note.create')
  create(@Req() req: DaxRequest, @Body() body: unknown): Promise<ReturnDto> {
    return this.service.create(sessionOf(req).policy, parse(ReturnInput, body));
  }

  @Patch(':id')
  @Requires('inventory.return_note.create')
  update(
    @Req() req: DaxRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<ReturnDto> {
    return this.service.update(
      sessionOf(req).policy,
      id,
      parse(ReturnUpdate, body),
    );
  }

  @Post(':id/post')
  @Requires('inventory.return_note.post')
  post(
    @Req() req: DaxRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<ReturnDto> {
    const { version } = parse(ReturnTransition, body);
    return this.service.post(sessionOf(req).policy, id, version);
  }

  @Post(':id/cancel')
  @Requires('inventory.return_note.create')
  cancel(
    @Req() req: DaxRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<ReturnDto> {
    const { version } = parse(ReturnTransition, body);
    return this.service.cancel(sessionOf(req).policy, id, version);
  }
}
