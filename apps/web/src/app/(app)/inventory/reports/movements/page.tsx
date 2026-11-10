import {
  Box,
  Group,
  Table,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
} from '@mantine/core';
import Link from 'next/link';
import {
  type MovementReportRow,
  REPORT_MOVEMENT_LABELS,
} from '@dax/inventory-contract';
import {
  canDo,
  CardBody,
  Empty,
  Mono,
  PageHead,
  Pager,
  SectionCard,
} from '@dax/web-shell';
import {
  formatCount,
  formatDateTime,
  formatQty,
} from '../../../../../lib/format';
import { flatten, type SearchParams } from '../../../../../lib/query';
import { requirePermission } from '../../../../../lib/server';
import { documentPath } from '../../receiving/_lib/labels';
import { ExportButton } from '../_lib/buttons';
import { PartNo, SignedQty } from '../_lib/cells';
import { getMovements } from '../_lib/data';
import { BASE, exportHref, reportPath } from '../_lib/reports';
import { MovementFilters } from './movement-filters';

function Doc({ row }: { row: MovementReportRow }) {
  const href = documentPath(row.docType, row.docId);
  const label = <Mono>{row.docNumber ?? row.docType}</Mono>;
  return href ? (
    <Link href={href} className="dax-link">
      {label}
    </Link>
  ) : (
    label
  );
}

export default async function MovementsReportPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const caps = await requirePermission('inventory.ledger.view');
  const query = flatten(await searchParams);
  const page = await getMovements(query);
  const linked = canDo(caps, 'inventory.item.view');
  const canExport = canDo(caps, 'inventory.ledger.export');
  const filtered = [
    'from',
    'to',
    'itemId',
    'binId',
    'movement',
    'docType',
  ].some((k) => query[k]);

  return (
    <>
      <PageHead
        eyebrow="Reports"
        title="Stock movements"
        back={{ href: BASE, label: 'Reports' }}
        lede="Newest first. Dates are Sri Lanka time. The export holds up to 50,000 rows; narrow the dates for more."
        actions={
          canExport && page.items.length ? (
            <ExportButton href={exportHref('movements', query)} />
          ) : null
        }
      />
      <SectionCard
        flush
        title="Movements"
        note={`${formatCount(page.total)} total`}
        toolbar={
          <MovementFilters
            item={
              page.filterItem
                ? { value: page.filterItem.id, label: page.filterItem.label }
                : null
            }
            bin={
              page.filterBin
                ? { value: page.filterBin.id, label: page.filterBin.label }
                : null
            }
          />
        }
      >
        {page.items.length === 0 ? (
          <CardBody>
            <Empty title="No movements">
              {filtered
                ? 'Try other dates or filters.'
                : 'Every receipt, put-away, issue, return and count change shows here.'}
            </Empty>
          </CardBody>
        ) : (
          <>
            <Box visibleFrom="md">
              <Table>
                <TableThead>
                  <TableTr>
                    <TableTh>When</TableTh>
                    <TableTh>Movement</TableTh>
                    <TableTh>Part number</TableTh>
                    <TableTh>Bin</TableTh>
                    <TableTh ta="right">Quantity</TableTh>
                    <TableTh ta="right">Bin after</TableTh>
                    <TableTh>Document</TableTh>
                    <TableTh>By</TableTh>
                  </TableTr>
                </TableThead>
                <TableTbody>
                  {page.items.map((row) => (
                    <TableTr key={row.id}>
                      <TableTd style={{ whiteSpace: 'nowrap' }}>
                        {formatDateTime(row.occurredAt)}
                      </TableTd>
                      <TableTd>{REPORT_MOVEMENT_LABELS[row.movement]}</TableTd>
                      <TableTd>
                        <PartNo item={row.item} linked={linked} />
                      </TableTd>
                      <TableTd>
                        <Mono>{row.bin.code}</Mono>
                      </TableTd>
                      <TableTd className="dax-num">
                        <SignedQty qty={row.qty} />
                      </TableTd>
                      <TableTd className="dax-num">
                        {formatQty(row.binQtyAfter)}{' '}
                        <span className="dax-muted">{row.item.uom}</span>
                      </TableTd>
                      <TableTd>
                        <Doc row={row} />
                      </TableTd>
                      <TableTd>{row.actor ?? '—'}</TableTd>
                    </TableTr>
                  ))}
                </TableTbody>
              </Table>
            </Box>
            <Box hiddenFrom="md" className="dax-rows">
              {page.items.map((row) => (
                <div key={row.id} className="dax-row">
                  <div className="dax-row-main">
                    <Group justify="space-between" wrap="nowrap">
                      <span>
                        <PartNo item={row.item} linked={linked} /> ·{' '}
                        {REPORT_MOVEMENT_LABELS[row.movement]}{' '}
                        <Mono>{row.bin.code}</Mono>
                      </span>
                      <b>
                        <SignedQty qty={row.qty} />
                      </b>
                    </Group>
                    <span className="dax-sub">
                      {formatDateTime(row.occurredAt)}
                      {row.actor ? ` · ${row.actor}` : ''} · Bin now{' '}
                      {formatQty(row.binQtyAfter)} {row.item.uom}
                    </span>
                    <span>
                      <Doc row={row} />
                    </span>
                  </div>
                </div>
              ))}
            </Box>
          </>
        )}
        <Pager
          path={reportPath('movements')}
          query={query}
          total={page.total}
          page={page.page}
          limit={page.limit}
        />
      </SectionCard>
    </>
  );
}
