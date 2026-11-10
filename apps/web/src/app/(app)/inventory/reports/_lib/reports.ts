import { type Query, toQuery } from '../../../../../lib/query';

export const BASE = '/inventory/reports';

export const REPORTS = {
  'below-minimum': {
    title: 'Below minimum',
    sub: 'Parts whose free stock is under the minimum, with what is already asked for.',
    icon: 'alert',
    use: 'often',
    view: 'inventory.stock.view',
    export: 'inventory.stock.export',
  },
  movements: {
    title: 'Stock movements',
    sub: 'Every receipt, put-away, issue, return and count change, by date.',
    icon: 'history',
    use: 'sometimes',
    view: 'inventory.ledger.view',
    export: 'inventory.ledger.export',
  },
  'stock-by-bin': {
    title: 'Stock by bin',
    sub: 'What should be on each shelf, zone by zone. Prints for floor checks.',
    icon: 'grid',
    use: 'sometimes',
    view: 'inventory.stock.view',
    export: 'inventory.stock.export',
  },
  'slow-moving': {
    title: 'Slow-moving stock',
    sub: 'Parts on the shelf that have not been issued for a while.',
    icon: 'archive',
    use: 'rarely',
    view: 'inventory.stock.view',
    export: 'inventory.stock.export',
  },
} as const;

export type ReportSlug = keyof typeof REPORTS;

export const REPORT_SLUGS = Object.keys(REPORTS) as ReportSlug[];

export function isReportSlug(value: string): value is ReportSlug {
  return value in REPORTS;
}

export function reportPath(slug: ReportSlug): string {
  return `${BASE}/${slug}`;
}

export function exportHref(slug: ReportSlug, query: Query = {}): string {
  return `/api/reports/${slug}${toQuery({ ...query, page: undefined, limit: undefined })}`;
}
