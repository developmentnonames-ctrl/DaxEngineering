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
  HoldConvert,
  type HoldDto,
  HoldInput,
  type HoldPage,
  HoldQuery,
  HoldRelease,
  type MrnDto,
} from '@dax/inventory-contract';
import { type DaxRequest, Requires, sessionOf } from '@dax/platform-core';
import { parse } from '../common';
import { HoldsService } from './holds.service';
import { MrnsService } from './mrns.service';

@Controller('inventory/holds')
export class HoldsController {
  constructor(
    private readonly holds: HoldsService,
    private readonly mrns: MrnsService,
  ) {}

  @Get()
  @Requires('inventory.hold.view')
  list(@Req() req: DaxRequest, @Query() query: unknown): Promise<HoldPage> {
    return this.holds.list(sessionOf(req).policy, parse(HoldQuery, query));
  }

  @Get(':id')
  @Requires('inventory.hold.view')
  get(
    @Req() req: DaxRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<HoldDto> {
    return this.holds.detail(sessionOf(req).policy, id);
  }

  @Post()
  @Requires('inventory.hold.create')
  create(@Req() req: DaxRequest, @Body() body: unknown): Promise<HoldDto> {
    return this.holds.create(sessionOf(req).policy, parse(HoldInput, body));
  }

  @Post(':id/release')
  @Requires('inventory.hold.release')
  release(
    @Req() req: DaxRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<HoldDto> {
    return this.holds.release(
      sessionOf(req).policy,
      id,
      parse(HoldRelease, body),
    );
  }

  @Post(':id/convert')
  @Requires('inventory.hold.convert')
  convert(
    @Req() req: DaxRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<MrnDto> {
    return this.mrns.convertHold(
      sessionOf(req).policy,
      id,
      parse(HoldConvert, body),
    );
  }
}
