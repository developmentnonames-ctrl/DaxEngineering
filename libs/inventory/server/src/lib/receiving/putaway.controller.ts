import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { PutawayInput, type PutawayList } from '@dax/inventory-contract';
import { type DaxRequest, Requires, sessionOf } from '@dax/platform-core';
import { parse } from '../common';
import { PutawayService } from './putaway.service';

@Controller('inventory/putaway')
export class PutawayController {
  constructor(private readonly putaway: PutawayService) {}

  @Get()
  @Requires('inventory.grn.putaway')
  list(): Promise<PutawayList> {
    return this.putaway.list();
  }

  @Post()
  @Requires('inventory.grn.putaway')
  putAway(@Req() req: DaxRequest, @Body() body: unknown): Promise<PutawayList> {
    return this.putaway.putAway(
      sessionOf(req).policy,
      parse(PutawayInput, body),
    );
  }
}
