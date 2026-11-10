import { Injectable } from '@nestjs/common';
import {
  type BelowMinReport,
  type BinStockBin,
  type BinStockQuery,
  type BinStockReport,
  type MovementReportPage,
  type MovementReportQuery,
  type MovementReportRow,
  REPORT_BIN_KIND_LABELS,
  REPORT_CSV_ROW_LIMIT,
  REPORT_MOVEMENT_LABELS,
  REPORT_ROW_LIMIT,
  type SlowMovingQuery,
  type SlowMovingReport,
} from '@dax/inventory-contract';
import { pageMeta, pageWindow } from '@dax/contracts';
import { Prisma, PrismaService } from '@dax/platform-db';
import { MainStore } from '../main-store.service';
import { userNames } from '../receiving/shared';
import { qtyString } from '../stock-math';
import {
  colomboDateTime,
  colomboDay,
  colomboRange,
  daysSince,
  freeOf,
  shortBy,
  slowMovingCutoff,
  toCsv,
} from './report-math';

type Decimalish = Prisma.Decimal | string | number;

interface BelowMinSql {
  id: string;
  part_no: string;
  brand: string;
  description: string;
  uom: string;
  min_qty: Decimalish;
  on_hand: Decimalish;
  held: Decimalish;
  quarantine: Decimalish;
  receiving: Decimalish;
  waiting: Decimalish;
}

interface BinStockSql {
  bin_id: string;
  bin_code: string;
  kind: BinStockBin['kind'];
  counting: boolean;
  zone_id: string;
  zone_code: string;
  zone_name: string;
  item_id: string;
  part_no: string;
  brand: string;
  description: string;
  uom: string;
  qty: Decimalish;
}

interface SlowMovingSql {
  id: string;
  part_no: string;
  brand: string;
  description: string;
  uom: string;
  on_hand: Decimalish;
  last_issued_at: Date | null;
  last_received_at: Date | null;
}

const LEDGER_SELECT = {
  id: true,
  occurredAt: true,
  qty: true,
  binQtyAfter: true,
  movement: true,
  docType: true,
  docId: true,
  docNumber: true,
  actorId: true,
  bin: { select: { id: true, code: true } },
  item: { select: { id: true, partNo: true, uom: true } },
} as const;

type LedgerRow = Prisma.StockLedgerGetPayload<{
  select: typeof LEDGER_SELECT;
}>;

const CSV_BATCH = 5000;
const TRUNCATED_NOTE = `Only the first ${REPORT_CSV_ROW_LIMIT.toLocaleString('en-US')} rows are included. Narrow the filters to see the rest.`;

export interface CsvFile {
  name: string;
  text: string;
}

function itemOf(
  id: string,
  r: { part_no: string; brand: string; description: string; uom: string },
) {
  return {
    id,
    partNo: r.part_no,
    brand: r.brand,
    description: r.description,
    uom: r.uom,
  };
}

function csvName(report: string, now = new Date()): string {
  return `${report}-${colomboDay(now)}.csv`;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly store: MainStore,
  ) {}

  async belowMin(limit = REPORT_ROW_LIMIT): Promise<BelowMinReport> {
    const storeId = await this.store.id();
    const rows = await this.prisma.$queryRaw<BelowMinSql[]>`
      WITH waiting AS (
        SELECT l.item_id,
          SUM(GREATEST(l.qty_requested - l.qty_issued - l.qty_short_closed - COALESCE(r.qty, 0), 0)) AS qty
        FROM inventory.mrn_line l
        JOIN inventory.mrn m ON m.id = l.mrn_id
        LEFT JOIN inventory.reservation r ON r.source = 'MRN' AND r.source_line_id = l.id
        WHERE m.status IN ('CHECKED', 'READY', 'PARTLY_ISSUED')
        GROUP BY l.item_id
      ), stock AS (
        SELECT i.id, i.part_no, br.name AS brand, i.description, i.uom, i.min_qty,
          COALESCE(b.on_hand, 0) AS on_hand, COALESCE(b.held, 0) AS held,
          COALESCE(b.quarantine, 0) AS quarantine, COALESCE(b.receiving, 0) AS receiving,
          COALESCE(w.qty, 0) AS waiting
        FROM inventory.item i
        JOIN inventory.brand br ON br.id = i.brand_id
        LEFT JOIN inventory.stock_balance b ON b.item_id = i.id AND b.store_id = ${storeId}::uuid
        LEFT JOIN waiting w ON w.item_id = i.id
        WHERE i.status = 'ACTIVE' AND i.min_qty > 0
      )
      SELECT id::text AS id, part_no, brand, description, uom, min_qty,
        on_hand, held, quarantine, receiving, waiting
      FROM stock
      WHERE on_hand - held - quarantine - receiving < min_qty
      ORDER BY min_qty - (on_hand - held - quarantine - receiving) DESC, part_no, id
      LIMIT ${limit + 1}`;
    return {
      items: rows.slice(0, limit).map((r) => {
        const free = freeOf({
          onHand: r.on_hand,
          held: r.held,
          quarantine: r.quarantine,
          receiving: r.receiving,
        });
        return {
          item: itemOf(r.id, r),
          minQty: qtyString(r.min_qty),
          onHand: qtyString(r.on_hand),
          held: qtyString(r.held),
          free: qtyString(free),
          shortBy: qtyString(shortBy(r.min_qty, free)),
          waiting: qtyString(r.waiting),
        };
      }),
      truncated: rows.length > limit,
    };
  }

  async belowMinCsv(): Promise<CsvFile> {
    const report = await this.belowMin(REPORT_CSV_ROW_LIMIT);
    const rows = report.items.map((r) => [
      r.item.partNo,
      r.item.brand,
      r.item.description,
      r.item.uom,
      r.minQty,
      r.onHand,
      r.held,
      r.free,
      r.shortBy,
      r.waiting,
    ]);
    if (report.truncated) rows.push([TRUNCATED_NOTE]);
    return {
      name: csvName('below-minimum'),
      text: toCsv(
        [
          'Part number',
          'Brand',
          'Description',
          'Unit',
          'Minimum',
          'On hand',
          'Held',
          'Free',
          'Short by',
          'Waiting on requests',
        ],
        rows,
      ),
    };
  }

  private async ledgerWhere(
    query: MovementReportQuery,
  ): Promise<Prisma.StockLedgerWhereInput> {
    return {
      storeId: await this.store.id(),
      ...(query.itemId ? { itemId: query.itemId } : {}),
      ...(query.binId ? { binId: query.binId } : {}),
      ...(query.movement ? { movement: query.movement } : {}),
      ...(query.docType ? { docType: query.docType } : {}),
      ...(query.from || query.to
        ? { occurredAt: colomboRange(query.from, query.to) }
        : {}),
    };
  }

  private ledgerPage(
    where: Prisma.StockLedgerWhereInput,
    point: { at: Date; id: string } | null,
    take: number,
  ): Promise<LedgerRow[]> {
    return this.prisma.stockLedger.findMany({
      where: point
        ? {
            AND: [
              where,
              {
                OR: [
                  { occurredAt: { lt: point.at } },
                  { occurredAt: point.at, id: { lt: point.id } },
                ],
              },
            ],
          }
        : where,
      select: LEDGER_SELECT,
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take,
    });
  }

  private async toMovementRows(
    rows: readonly LedgerRow[],
  ): Promise<MovementReportRow[]> {
    const names = await userNames(
      this.prisma,
      rows.map((r) => r.actorId),
    );
    return rows.map((r) => ({
      id: r.id,
      occurredAt: r.occurredAt.toISOString(),
      item: r.item,
      bin: r.bin,
      qty: qtyString(r.qty),
      binQtyAfter: qtyString(r.binQtyAfter),
      movement: r.movement,
      docType: r.docType,
      docId: r.docId,
      docNumber: r.docNumber,
      actor: names.get(r.actorId) ?? null,
    }));
  }

  async movements(query: MovementReportQuery): Promise<MovementReportPage> {
    const where = await this.ledgerWhere(query);
    const [rows, total, filterItem, filterBin] = await Promise.all([
      this.prisma.stockLedger.findMany({
        where,
        select: LEDGER_SELECT,
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        ...pageWindow(query),
      }),
      this.prisma.stockLedger.count({ where }),
      query.itemId
        ? this.prisma.item.findUnique({
            where: { id: query.itemId },
            select: {
              id: true,
              partNo: true,
              description: true,
              brand: { select: { name: true } },
            },
          })
        : null,
      query.binId
        ? this.prisma.bin.findUnique({
            where: { id: query.binId },
            select: { id: true, code: true },
          })
        : null,
    ]);
    return {
      items: await this.toMovementRows(rows),
      ...pageMeta(query, total),
      filterItem: filterItem
        ? {
            id: filterItem.id,
            label: `${filterItem.partNo} (${filterItem.brand.name}) · ${filterItem.description}`,
          }
        : null,
      filterBin: filterBin ? { id: filterBin.id, label: filterBin.code } : null,
    };
  }

  async movementsCsv(query: MovementReportQuery): Promise<CsvFile> {
    const where = await this.ledgerWhere(query);
    const all: LedgerRow[] = [];
    let point: { at: Date; id: string } | null = null;
    while (all.length <= REPORT_CSV_ROW_LIMIT) {
      const take = Math.min(CSV_BATCH, REPORT_CSV_ROW_LIMIT + 1 - all.length);
      const batch = await this.ledgerPage(where, point, take);
      all.push(...batch);
      const last = batch[batch.length - 1];
      if (batch.length < take || !last) break;
      point = { at: last.occurredAt, id: last.id };
    }
    const truncated = all.length > REPORT_CSV_ROW_LIMIT;
    const rows = await this.toMovementRows(all.slice(0, REPORT_CSV_ROW_LIMIT));
    const cells: (string | null)[][] = rows.map((r) => [
      colomboDateTime(new Date(r.occurredAt)),
      REPORT_MOVEMENT_LABELS[r.movement],
      r.item.partNo,
      r.bin.code,
      r.qty,
      r.binQtyAfter,
      r.item.uom,
      r.docNumber ?? r.docType,
      r.actor,
    ]);
    if (truncated) cells.push([TRUNCATED_NOTE]);
    return {
      name: csvName('stock-movements'),
      text: toCsv(
        [
          'Date and time',
          'Movement',
          'Part number',
          'Bin',
          'Quantity',
          'Bin quantity after',
          'Unit',
          'Document',
          'By',
        ],
        cells,
      ),
    };
  }

  async stockByBin(
    query: BinStockQuery,
    limit = REPORT_ROW_LIMIT,
  ): Promise<BinStockReport> {
    const storeId = await this.store.id();
    const zone = query.zoneId
      ? Prisma.sql`AND b.zone_id = ${query.zoneId}::uuid`
      : Prisma.empty;
    const kind = query.kind
      ? Prisma.sql`AND b.kind::text = ${query.kind}`
      : Prisma.empty;
    const rows = await this.prisma.$queryRaw<BinStockSql[]>`
      SELECT b.id::text AS bin_id, b.code AS bin_code, b.kind::text AS kind,
        b.count_id IS NOT NULL AS counting,
        z.id::text AS zone_id, z.code AS zone_code, z.name AS zone_name,
        i.id::text AS item_id, i.part_no, br.name AS brand, i.description, i.uom, s.qty
      FROM inventory.bin_stock s
      JOIN inventory.bin b ON b.id = s.bin_id
      JOIN inventory.zone z ON z.id = b.zone_id
      JOIN inventory.item i ON i.id = s.item_id
      JOIN inventory.brand br ON br.id = i.brand_id
      WHERE s.qty > 0 AND b.store_id = ${storeId}::uuid ${zone} ${kind}
      ORDER BY z.code, b.code, i.part_no, i.id
      LIMIT ${limit + 1}`;
    const bins: BinStockBin[] = [];
    for (const r of rows.slice(0, limit)) {
      let bin = bins[bins.length - 1];
      if (bin?.id !== r.bin_id) {
        bin = {
          id: r.bin_id,
          code: r.bin_code,
          kind: r.kind,
          zone: { id: r.zone_id, code: r.zone_code, name: r.zone_name },
          beingCounted: r.counting,
          lines: [],
        };
        bins.push(bin);
      }
      bin.lines.push({ item: itemOf(r.item_id, r), qty: qtyString(r.qty) });
    }
    return { bins, truncated: rows.length > limit };
  }

  async stockByBinCsv(query: BinStockQuery): Promise<CsvFile> {
    const report = await this.stockByBin(query, REPORT_CSV_ROW_LIMIT);
    const rows: (string | null)[][] = report.bins.flatMap((b) =>
      b.lines.map((l) => [
        `${b.zone.code} · ${b.zone.name}`,
        b.code,
        REPORT_BIN_KIND_LABELS[b.kind],
        b.beingCounted ? 'Yes' : 'No',
        l.item.partNo,
        l.item.brand,
        l.item.description,
        l.qty,
        l.item.uom,
      ]),
    );
    if (report.truncated) rows.push([TRUNCATED_NOTE]);
    return {
      name: csvName('stock-by-bin'),
      text: toCsv(
        [
          'Zone',
          'Bin',
          'Bin kind',
          'Being counted',
          'Part number',
          'Brand',
          'Description',
          'Quantity',
          'Unit',
        ],
        rows,
      ),
    };
  }

  async slowMoving(
    query: SlowMovingQuery,
    limit = REPORT_ROW_LIMIT,
    now = new Date(),
  ): Promise<SlowMovingReport> {
    const storeId = await this.store.id();
    const cutoff = slowMovingCutoff(Number(query.days), now);
    const rows = await this.prisma.$queryRaw<SlowMovingSql[]>`
      SELECT i.id::text AS id, i.part_no, br.name AS brand, i.description, i.uom,
        b.on_hand, li.at AS last_issued_at, lr.at AS last_received_at
      FROM inventory.stock_balance b
      JOIN inventory.item i ON i.id = b.item_id
      JOIN inventory.brand br ON br.id = i.brand_id
      LEFT JOIN LATERAL (
        SELECT MAX(l.occurred_at) AS at FROM inventory.stock_ledger l
        WHERE l.item_id = b.item_id AND l.store_id = b.store_id AND l.movement = 'ISSUE'
      ) li ON true
      LEFT JOIN LATERAL (
        SELECT MAX(l.occurred_at) AS at FROM inventory.stock_ledger l
        WHERE l.item_id = b.item_id AND l.store_id = b.store_id
          AND l.movement IN ('RECEIVE', 'RECEIVE_DAMAGED')
      ) lr ON true
      WHERE b.store_id = ${storeId}::uuid AND b.on_hand > 0
        AND (li.at IS NULL OR li.at < ${cutoff})
      ORDER BY li.at ASC NULLS FIRST, i.part_no, i.id
      LIMIT ${limit + 1}`;
    return {
      items: rows.slice(0, limit).map((r) => ({
        item: itemOf(r.id, r),
        onHand: qtyString(r.on_hand),
        lastIssuedAt: r.last_issued_at?.toISOString() ?? null,
        lastReceivedAt: r.last_received_at?.toISOString() ?? null,
        daysSinceIssue: r.last_issued_at
          ? daysSince(r.last_issued_at, now)
          : null,
      })),
      truncated: rows.length > limit,
    };
  }

  async slowMovingCsv(query: SlowMovingQuery): Promise<CsvFile> {
    const report = await this.slowMoving(query, REPORT_CSV_ROW_LIMIT);
    const day = (iso: string | null) =>
      iso ? colomboDay(new Date(iso)) : null;
    const rows: (string | number | null)[][] = report.items.map((r) => [
      r.item.partNo,
      r.item.brand,
      r.item.description,
      r.onHand,
      r.item.uom,
      day(r.lastIssuedAt) ?? 'Never issued',
      day(r.lastReceivedAt),
      r.daysSinceIssue,
    ]);
    if (report.truncated) rows.push([TRUNCATED_NOTE]);
    return {
      name: csvName(`no-issue-${query.days}-days`),
      text: toCsv(
        [
          'Part number',
          'Brand',
          'Description',
          'On hand',
          'Unit',
          'Last issued',
          'Last received',
          'Days since last issue',
        ],
        rows,
      ),
    };
  }
}
