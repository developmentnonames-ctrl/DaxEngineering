import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { ItemsController } from './items.controller';
import { ItemsService } from './items.service';
import { LabelsController } from './labels.controller';
import { LocationsController } from './locations.controller';
import { LocationsService } from './locations.service';
import { MainStore } from './main-store.service';
import { ScanController } from './scan.controller';
import { ScanService } from './scan.service';
import { StockController } from './stock.controller';
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
  ],
  providers: [MainStore, ItemsService, LocationsService, ScanService],
  exports: [MainStore, ItemsService, LocationsService, ScanService],
})
export class InventoryServerModule {}
