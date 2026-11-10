import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  CountAddLine,
  CountCreate,
  type CountDto,
  CountEntry,
  type CountPage,
  CountQuery,
  CountReason,
  type CountScope,
  CountTransition,
} from '@dax/inventory-contract';
import { type DaxRequest, Requires, sessionOf } from '@dax/platform-core';
import { parse } from '../common';
import { CountsService } from './counts.service';

@Controller('inventory/counts')
export class CountsController {
  constructor(private readonly service: CountsService) {}

  @Get()
  @Requires('inventory.count.view')
  list(@Query() query: unknown): Promise<CountPage> {
    return this.service.list(parse(CountQuery, query));
  }

  @Get('scope')
  @Requires('inventory.count.create')
  scope(): Promise<CountScope> {
    return this.service.scope();
  }

  @Get(':id')
  @Requires('inventory.count.view')
  get(
    @Req() req: DaxRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CountDto> {
    return this.service.detail(sessionOf(req).policy, id);
  }

  @Post()
  @Requires('inventory.count.create')
  create(@Req() req: DaxRequest, @Body() body: unknown): Promise<CountDto> {
    return this.service.create(sessionOf(req).policy, parse(CountCreate, body));
  }

  @Post(':id/counts')
  @Requires('inventory.count.count')
  enter(
    @Req() req: DaxRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<CountDto> {
    return this.service.enter(
      sessionOf(req).policy,
      id,
      parse(CountEntry, body),
    );
  }

  @Post(':id/lines')
  @Requires('inventory.count.count')
  addLine(
    @Req() req: DaxRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<CountDto> {
    return this.service.addLine(
      sessionOf(req).policy,
      id,
      parse(CountAddLine, body),
    );
  }

  @Post(':id/lines/:lineId/remove')
  @Requires('inventory.count.count')
  removeLine(
    @Req() req: DaxRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @Body() body: unknown,
  ): Promise<CountDto> {
    const { version } = parse(CountTransition, body);
    return this.service.removeLine(sessionOf(req).policy, id, lineId, version);
  }

  @Post(':id/submit')
  @Requires('inventory.count.submit')
  submit(
    @Req() req: DaxRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<CountDto> {
    const { version } = parse(CountTransition, body);
    return this.service.submit(sessionOf(req).policy, id, version);
  }

  @Post(':id/approve')
  @Requires('inventory.count.approve')
  approve(
    @Req() req: DaxRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<CountDto> {
    const { version } = parse(CountTransition, body);
    return this.service.approve(sessionOf(req).policy, id, version);
  }

  @Post(':id/send-back')
  @Requires('inventory.count.approve')
  sendBack(
    @Req() req: DaxRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<CountDto> {
    return this.service.sendBack(
      sessionOf(req).policy,
      id,
      parse(CountReason, body),
    );
  }

  @Post(':id/cancel')
  @Requires('inventory.count.cancel')
  cancel(
    @Req() req: DaxRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<CountDto> {
    return this.service.cancel(
      sessionOf(req).policy,
      id,
      parse(CountReason, body),
    );
  }
}
