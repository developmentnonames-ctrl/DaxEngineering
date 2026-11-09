import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { type MovementPage, MovementQuery } from '@dax/inventory-contract';
import { Requires } from '@dax/platform-core';
import { parse } from '../common';
import { MovementsService } from './movements.service';

@Controller('inventory/items')
export class MovementsController {
  constructor(private readonly movements: MovementsService) {}

  @Get(':id/movements')
  @Requires('inventory.ledger.view')
  list(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: unknown,
  ): Promise<MovementPage> {
    return this.movements.forItem(id, parse(MovementQuery, query));
  }
}
