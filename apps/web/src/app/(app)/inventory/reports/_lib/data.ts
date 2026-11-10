import 'server-only';
import {
  BelowMinReport,
  BinStockQuery,
  BinStockReport,
  MovementReportPage,
  MovementReportQuery,
  SlowMovingQuery,
  SlowMovingReport,
} from '@dax/inventory-contract';
import { load } from '../../../../../lib/load';
import { type Query, readQuery, toQuery } from '../../../../../lib/query';
import { api } from '../../../../../lib/server';

const API = '/inventory/reports';

export function getBelowMin() {
  return load(api.request(`${API}/below-min`, (d) => BelowMinReport.parse(d)));
}

export function getMovements(raw: Query) {
  return load(
    api.request(
      `${API}/movements${toQuery(readQuery(MovementReportQuery, raw))}`,
      (d) => MovementReportPage.parse(d),
    ),
  );
}

export function getStockByBin(raw: Query) {
  return load(
    api.request(
      `${API}/stock-by-bin${toQuery(readQuery(BinStockQuery, raw))}`,
      (d) => BinStockReport.parse(d),
    ),
  );
}

export function getSlowMoving(raw: Query) {
  return load(
    api.request(
      `${API}/slow-moving${toQuery(readQuery(SlowMovingQuery, raw))}`,
      (d) => SlowMovingReport.parse(d),
    ),
  );
}
