import { Module } from '@nestjs/common';
import { StockReconcileJob } from './reconcile';

@Module({ providers: [StockReconcileJob] })
export class InventoryJobsModule {}
