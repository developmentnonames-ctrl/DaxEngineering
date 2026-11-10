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
  SLOW_MOVING_DAYS,
  SlowMovingQuery,
  type SlowMovingRow,
} from '@dax/inventory-contract';
import { canDo, CardBody, Empty, PageHead, SectionCard } from '@dax/web-shell';
import { formatQty } from '../../../../../lib/format';
import {
  flatten,
  readQuery,
  type SearchParams,
} from '../../../../../lib/query';
import { requirePermission } from '../../../../../lib/server';
import { ExportButton } from '../_lib/buttons';
import { PartNo, TruncatedNote } from '../_lib/cells';
import { getSlowMoving } from '../_lib/data';
import { BASE, exportHref } from '../_lib/reports';
import { SelectFilters } from '../_lib/select-filters';

const DAY_OPTIONS = SLOW_MOVING_DAYS.map((d) => ({
  value: d,
  label: d === '365' ? 'A year or more' : `${d} days or more`,
}));

const colomboDate = new Intl.DateTimeFormat('en-LK', {
  timeZone: 'Asia/Colombo',
  dateStyle: 'medium',
});

function when(iso: string | null, fallback: string): string {
  return iso ? colomboDate.format(new Date(iso)) : fallback;
}

function age(row: SlowMovingRow): string {
  if (row.daysSinceIssue === null) return 'Never issued';
  return `${row.daysSinceIssue.toLocaleString('en-LK')} days`;
}

export default async function SlowMovingPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const caps = await requirePermission('inventory.stock.view');
  const query = flatten(await searchParams);
  const { days } = readQuery(SlowMovingQuery, query);
  const report = await getSlowMoving(query);
  const linked = canDo(caps, 'inventory.item.view');
  const canExport = canDo(caps, 'inventory.stock.export');

  return (
    <>
      <PageHead
        eyebrow="Reports"
        title="Slow-moving stock"
        back={{ href: BASE, label: 'Reports' }}
        lede={`Parts with stock on hand that have not been issued in the last ${days} days, including parts never issued. Longest idle first.`}
        actions={
          canExport && report.items.length ? (
            <ExportButton href={exportHref('slow-moving', { days })} />
          ) : null
        }
      />
      <TruncatedNote truncated={report.truncated} canExport={canExport} />
      <SectionCard
        flush
        title="Not issued recently"
        note={`${report.items.length}${report.truncated ? '+' : ''} ${report.items.length === 1 ? 'part' : 'parts'}`}
        toolbar={
          <SelectFilters
            selects={[
              {
                name: 'days',
                label: 'No issue for',
                data: DAY_OPTIONS,
                defaultValue: '90',
              },
            ]}
          />
        }
      >
        {report.items.length === 0 ? (
          <CardBody>
            <Empty title="Nothing slow-moving">
              Every part in stock was issued in the last {days} days.
            </Empty>
          </CardBody>
        ) : (
          <>
            <Box visibleFrom="md">
              <Table>
                <TableThead>
                  <TableTr>
                    <TableTh>Part number</TableTh>
                    <TableTh>Description</TableTh>
                    <TableTh ta="right">On hand</TableTh>
                    <TableTh>Last issued</TableTh>
                    <TableTh>Last received</TableTh>
                    <TableTh ta="right">Since last issue</TableTh>
                  </TableTr>
                </TableThead>
                <TableTbody>
                  {report.items.map((row) => (
                    <TableTr key={row.item.id}>
                      <TableTd>
                        <PartNo item={row.item} linked={linked} />
                        <div className="dax-sub">{row.item.brand}</div>
                      </TableTd>
                      <TableTd>{row.item.description}</TableTd>
                      <TableTd className="dax-num">
                        {formatQty(row.onHand)}{' '}
                        <span className="dax-muted">{row.item.uom}</span>
                      </TableTd>
                      <TableTd>{when(row.lastIssuedAt, 'Never')}</TableTd>
                      <TableTd>{when(row.lastReceivedAt, '—')}</TableTd>
                      <TableTd className="dax-num">
                        <b>{age(row)}</b>
                      </TableTd>
                    </TableTr>
                  ))}
                </TableTbody>
              </Table>
            </Box>
            <Box hiddenFrom="md" className="dax-rows">
              {report.items.map((row) => (
                <div key={row.item.id} className="dax-row">
                  <div className="dax-row-main">
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 8,
                      }}
                    >
                      <span style={{ fontSize: 17 }}>
                        <PartNo item={row.item} linked={linked} />
                      </span>
                      <b>{age(row)}</b>
                    </div>
                    <span>{row.item.description}</span>
                    <span className="dax-sub">
                      On hand {formatQty(row.onHand)} {row.item.uom} · Last
                      issued {when(row.lastIssuedAt, 'never')} · Last received{' '}
                      {when(row.lastReceivedAt, '—')}
                    </span>
                  </div>
                </div>
              ))}
            </Box>
          </>
        )}
      </SectionCard>
    </>
  );
}
