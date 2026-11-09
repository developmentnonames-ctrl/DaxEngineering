import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { AodsController } from './issuing/aods.controller';
import { AodsService } from './issuing/aods.service';
import { HoldsController } from './issuing/holds.controller';
import { HoldsService } from './issuing/holds.service';
import {
  IssuingSummaryController,
  MrnsController,
} from './issuing/mrns.controller';
import { MrnsService } from './issuing/mrns.service';
import { MRN_RELEASE_GATES } from './issuing/shared';
import { ItemsController } from './items.controller';
import { ItemsService } from './items.service';
import { LabelsController } from './labels.controller';
import { LocationsController } from './locations.controller';
import { LocationsService } from './locations.service';
import { MainStore } from './main-store.service';
import { DiscrepanciesController } from './receiving/discrepancies.controller';
import { DiscrepanciesService } from './receiving/discrepancies.service';
import {
  GrnsController,
  ReceivingSummaryController,
} from './receiving/grns.controller';
import { GrnsService } from './receiving/grns.service';
import { MovementsController } from './receiving/movements.controller';
import { MovementsService } from './receiving/movements.service';
import { PutawayController } from './receiving/putaway.controller';
import { PutawayService } from './receiving/putaway.service';
import { ScanController } from './scan.controller';
import { ScanService } from './scan.service';
import { StockController } from './stock.controller';
import { StockPostingService } from './stock/stock-posting.service';
import { SummaryController } from './summary.controller';

@Module({
  controllers: [
    CatalogController,
    ItemsController,
    LocationsController,
    StockController,
    LabelsController,
    ScanController,
    SummaryController,
    GrnsController,
    ReceivingSummaryController,
    PutawayController,
    DiscrepanciesController,
    MovementsController,
    HoldsController,
    MrnsController,
    IssuingSummaryController,
    AodsController,
  ],
  providers: [
    MainStore,
    ItemsService,
    LocationsService,
    ScanService,
    StockPostingService,
    GrnsService,
    PutawayService,
    DiscrepanciesService,
    MovementsService,
    HoldsService,
    MrnsService,
    AodsService,
    { provide: MRN_RELEASE_GATES, useValue: [] },
  ],
  exports: [
    MainStore,
    ItemsService,
    LocationsService,
    ScanService,
    StockPostingService,
  ],
})
export class InventoryServerModule {}
