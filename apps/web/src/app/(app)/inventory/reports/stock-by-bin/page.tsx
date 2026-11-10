import {
  Box,
  Table,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
} from '@mantine/core';
import {
  BIN_KINDS,
  type BinStockBin,
  REPORT_BIN_KIND_LABELS,
} from '@dax/inventory-contract';
import {
  canDo,
  CardBody,
  Empty,
  Mono,
  PageHead,
  Pill,
  SectionCard,
} from '@dax/web-shell';
import { formatDateTime, formatQty } from '../../../../../lib/format';
import { flatten, type SearchParams } from '../../../../../lib/query';
import { requirePermission } from '../../../../../lib/server';
import { getZones } from '../../_lib/data';
import { ExportButton, PrintButton } from '../_lib/buttons';
import { PartNo, TruncatedNote } from '../_lib/cells';
import { getStockByBin } from '../_lib/data';
import { groupByZone } from '../_lib/group';
import { BASE, exportHref } from '../_lib/reports';
import { SelectFilters } from '../_lib/select-filters';

const PRINT_CSS = `
.rpt-print-only { display: none; }
@media print {
  @page { size: A4; margin: 12mm; }
  html, body { background: #fff !important; color: #000 !important; }
  .dax-top, .dax-rail, .dax-back, .dax-head-actions, .dax-no-print,
  .dax-card-tools, .rpt-rows { display: none !important; }
  .dax-shell { display: block !important; padding: 0 !important; }
  .dax-main { padding: 0 !important; }
  .dax-card { box-shadow: none !important; border: 1px solid #999 !important; break-inside: auto; }
  .rpt-table { display: block !important; }
  .rpt-print-only { display: block; }
  td.rpt-print-only, th.rpt-print-only { display: table-cell; }
  .rpt-table th, .rpt-table td { font-size: 10pt; padding: 4px 6px !important; color: #000 !important; }
  .rpt-bin { break-inside: avoid; }
  .rpt-box { display: inline-block; width: 40px; height: 16px; border: 1px solid #000; }
}
`;

const KIND_OPTIONS = BIN_KINDS.map((k) => ({
  value: k,
  label: REPORT_BIN_KIND_LABELS[k],
}));

function Counting({ bin }: { bin: BinStockBin }) {
  return bin.beingCounted ? <Pill tone="hi">Being counted</Pill> : null;
}

function BinRows({ bin, linked }: { bin: BinStockBin; linked: boolean }) {
  return (
    <TableTbody className="rpt-bin">
      {bin.lines.map((line, i) => (
        <TableTr key={line.item.id}>
          {i === 0 ? (
            <TableTd
              rowSpan={bin.lines.length}
              style={{ verticalAlign: 'top' }}
            >
              <div className="dax-stack" style={{ gap: 4 }}>
                <b>
                  <Mono>{bin.code}</Mono>
                </b>
                <Counting bin={bin} />
              </div>
            </TableTd>
          ) : null}
          <TableTd>
            <PartNo item={line.item} linked={linked} />
          </TableTd>
          <TableTd>{line.item.brand}</TableTd>
          <TableTd>{line.item.description}</TableTd>
          <TableTd className="dax-num">
            <b>{formatQty(line.qty)}</b>{' '}
            <span className="dax-muted">{line.item.uom}</span>
          </TableTd>
          <TableTd className="rpt-print-only">
            <span className="rpt-box" />
          </TableTd>
        </TableTr>
      ))}
    </TableTbody>
  );
}

export default async function StockByBinPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const caps = await requirePermission('inventory.stock.view');
  const query = flatten(await searchParams);
  const [zones, report] = await Promise.all([getZones(), getStockByBin(query)]);
  const linked = canDo(caps, 'inventory.item.view');
  const canExport = canDo(caps, 'inventory.stock.export');
  const groups = groupByZone(report.bins);
  const zone = zones.find((z) => z.id === query['zoneId']);
  const kind = KIND_OPTIONS.find((k) => k.value === query['kind']);
  const scope = [
    zone ? `Zone ${zone.code} · ${zone.name}` : 'All zones',
    kind ? `${kind.label} bins` : 'all bins',
  ].join(', ');

  return (
    <>
      <style>{PRINT_CSS}</style>
      <PageHead
        eyebrow="Reports"
        title="Stock by bin"
        back={{ href: BASE, label: 'Reports' }}
        lede="Every bin with stock and what should be in it. Bins being counted are frozen until the count is posted."
        actions={
          report.bins.length ? (
            <>
              <PrintButton />
              {canExport ? (
                <ExportButton href={exportHref('stock-by-bin', query)} />
              ) : null}
            </>
          ) : null
        }
      />
      <p className="rpt-print-only">
        Printed {formatDateTime(new Date().toISOString())}
      </p>
      <SectionCard
        flush
        title={scope}
        note={`${report.bins.length}${report.truncated ? '+' : ''} ${report.bins.length === 1 ? 'bin' : 'bins'} with stock`}
        toolbar={
          <SelectFilters
            selects={[
              {
                name: 'zoneId',
                label: 'Zone',
                placeholder: 'All zones',
                data: zones.map((z) => ({
                  value: z.id,
                  label: `${z.code} · ${z.name}`,
                })),
              },
              {
                name: 'kind',
                label: 'Bin kind',
                placeholder: 'All kinds',
                data: KIND_OPTIONS,
              },
            ]}
          />
        }
      >
        {report.bins.length === 0 ? (
          <CardBody>
            <Empty title="No stock here">
              No bin in this zone holds any stock. Try another zone or kind.
            </Empty>
          </CardBody>
        ) : null}
      </SectionCard>
      <TruncatedNote truncated={report.truncated} canExport={canExport} />
      {groups.map((group) => (
        <SectionCard
          key={group.zone.id}
          flush
          title={`Zone ${group.zone.code} · ${group.zone.name}`}
          note={`${group.bins.length} ${group.bins.length === 1 ? 'bin' : 'bins'} · ${group.lineCount} ${group.lineCount === 1 ? 'line' : 'lines'}`}
        >
          <Box visibleFrom="md" className="rpt-table">
            <Table>
              <TableThead>
                <TableTr>
                  <TableTh>Bin</TableTh>
                  <TableTh>Part number</TableTh>
                  <TableTh>Brand</TableTh>
                  <TableTh>Description</TableTh>
                  <TableTh ta="right">Quantity</TableTh>
                  <TableTh className="rpt-print-only">Checked</TableTh>
                </TableTr>
              </TableThead>
              {group.bins.map((bin) => (
                <BinRows key={bin.id} bin={bin} linked={linked} />
              ))}
            </Table>
          </Box>
          <Box hiddenFrom="md" className="dax-rows rpt-rows">
            {group.bins.map((bin) => (
              <div key={bin.id} className="dax-row">
                <div className="dax-row-main">
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 8,
                    }}
                  >
                    <b style={{ fontSize: 17 }}>
                      <Mono>{bin.code}</Mono>
                    </b>
                    <Counting bin={bin} />
                  </div>
                  {bin.lines.map((line) => (
                    <div
                      key={line.item.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 8,
                      }}
                    >
                      <span style={{ minWidth: 0 }}>
                        <PartNo item={line.item} linked={linked} />{' '}
                        <span className="dax-sub">{line.item.description}</span>
                      </span>
                      <b style={{ whiteSpace: 'nowrap' }}>
                        {formatQty(line.qty)} {line.item.uom}
                      </b>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </Box>
        </SectionCard>
      ))}
    </>
  );
}
