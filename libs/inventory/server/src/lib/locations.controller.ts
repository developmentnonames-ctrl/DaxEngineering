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
  BinBulkInput,
  type BinBulkResult,
  type BinDetail,
  type BinDto,
  BinInput,
  type BinPage,
  BinQuery,
  BinUpdate,
  type ZoneDto,
  ZoneInput,
  type ZoneList,
  ZoneUpdate,
} from '@dax/inventory-contract';
import { type DaxRequest, Requires, sessionOf } from '@dax/platform-core';
import { parse } from './common';
import { LocationsService } from './locations.service';

@Controller('inventory')
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  @Get('zones')
  @Requires('inventory.location.view')
  async zones(): Promise<ZoneList> {
    return { zones: await this.locations.zones() };
  }

  @Post('zones')
  @Requires('inventory.location.manage')
  createZone(@Body() body: unknown): Promise<ZoneDto> {
    return this.locations.createZone(parse(ZoneInput, body));
  }

  @Patch('zones/:id')
  @Requires('inventory.location.manage')
  updateZone(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<ZoneDto> {
    return this.locations.updateZone(id, parse(ZoneUpdate, body));
  }

  @Get('bins')
  @Requires('inventory.location.view')
  bins(@Req() req: DaxRequest, @Query() query: unknown): Promise<BinPage> {
    return this.locations.bins(sessionOf(req).policy, parse(BinQuery, query));
  }

  @Post('bins/bulk')
  @Requires('inventory.location.manage')
  bulk(@Req() req: DaxRequest, @Body() body: unknown): Promise<BinBulkResult> {
    return this.locations.bulkCreate(
      sessionOf(req).policy,
      parse(BinBulkInput, body),
    );
  }

  @Get('bins/:id')
  @Requires('inventory.location.view')
  bin(
    @Req() req: DaxRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BinDetail> {
    return this.locations.bin(sessionOf(req).policy, id);
  }

  @Post('bins')
  @Requires('inventory.location.manage')
  createBin(@Req() req: DaxRequest, @Body() body: unknown): Promise<BinDto> {
    return this.locations.createBin(
      sessionOf(req).policy,
      parse(BinInput, body),
    );
  }

  @Patch('bins/:id')
  @Requires('inventory.location.manage')
  updateBin(
    @Req() req: DaxRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<BinDto> {
    return this.locations.updateBin(
      sessionOf(req).policy,
      id,
      parse(BinUpdate, body),
    );
  }
}
