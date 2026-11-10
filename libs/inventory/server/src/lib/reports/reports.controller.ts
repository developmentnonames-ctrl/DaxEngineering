import { Controller, Get, Header, Query, StreamableFile } from '@nestjs/common';
import {
  type BelowMinReport,
  BinStockQuery,
  type BinStockReport,
  type MovementReportPage,
  MovementReportQuery,
  SlowMovingQuery,
  type SlowMovingReport,
} from '@dax/inventory-contract';
import { Requires } from '@dax/platform-core';
import { parse } from '../common';
import { type CsvFile, ReportsService } from './reports.service';

function csv(file: CsvFile): StreamableFile {
  const body = Buffer.from(file.text, 'utf8');
  return new StreamableFile(body, {
    type: 'text/csv; charset=utf-8',
    disposition: `attachment; filename="${file.name}"`,
    length: body.length,
  });
}

@Controller('inventory/reports')
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Get('below-min')
  @Requires('inventory.stock.view')
  belowMin(): Promise<BelowMinReport> {
    return this.service.belowMin();
  }

  @Get('below-min/csv')
  @Requires('inventory.stock.export')
  @Header('Cache-Control', 'no-store')
  async belowMinCsv(): Promise<StreamableFile> {
    return csv(await this.service.belowMinCsv());
  }

  @Get('movements')
  @Requires('inventory.ledger.view')
  movements(@Query() query: unknown): Promise<MovementReportPage> {
    return this.service.movements(parse(MovementReportQuery, query));
  }

  @Get('movements/csv')
  @Requires('inventory.ledger.export')
  @Header('Cache-Control', 'no-store')
  async movementsCsv(@Query() query: unknown): Promise<StreamableFile> {
    return csv(
      await this.service.movementsCsv(parse(MovementReportQuery, query)),
    );
  }

  @Get('stock-by-bin')
  @Requires('inventory.stock.view')
  stockByBin(@Query() query: unknown): Promise<BinStockReport> {
    return this.service.stockByBin(parse(BinStockQuery, query));
  }

  @Get('stock-by-bin/csv')
  @Requires('inventory.stock.export')
  @Header('Cache-Control', 'no-store')
  async stockByBinCsv(@Query() query: unknown): Promise<StreamableFile> {
    return csv(await this.service.stockByBinCsv(parse(BinStockQuery, query)));
  }

  @Get('slow-moving')
  @Requires('inventory.stock.view')
  slowMoving(@Query() query: unknown): Promise<SlowMovingReport> {
    return this.service.slowMoving(parse(SlowMovingQuery, query));
  }

  @Get('slow-moving/csv')
  @Requires('inventory.stock.export')
  @Header('Cache-Control', 'no-store')
  async slowMovingCsv(@Query() query: unknown): Promise<StreamableFile> {
    return csv(await this.service.slowMovingCsv(parse(SlowMovingQuery, query)));
  }
}
