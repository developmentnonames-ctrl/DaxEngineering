import { PartiesSummaryController } from './summary.controller';
import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
  RequestMethod,
} from '@nestjs/common';
import { CustomersController } from './customers.controller';
import { CsvBodyMiddleware } from './http';
import { PartiesService } from './parties.service';
import { SuppliersController } from './suppliers.controller';

@Module({
  controllers: [
    CustomersController,
    SuppliersController,
    PartiesSummaryController,
  ],
  providers: [PartiesService],
  exports: [PartiesService],
})
export class PartiesServerModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(CsvBodyMiddleware)
      .forRoutes(
        { path: 'parties/customers/import', method: RequestMethod.POST },
        { path: 'parties/suppliers/import', method: RequestMethod.POST },
      );
  }
}
