import {
  Box,
  Table,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
} from '@mantine/core';
import Link from 'next/link';
import {
  CardBody,
  Empty,
  Mono,
  PageHead,
  Pager,
  SectionCard,
} from '@dax/web-shell';
import { ListFilters } from '../../../../../components/list-filters';
import {
  formatCount,
  formatDateTime,
  formatQty,
} from '../../../../../lib/format';
import { flatten, type SearchParams } from '../../../../../lib/query';
import { requirePermission } from '../../../../../lib/server';
import { listDiscrepancies } from '../_lib/data';
import { BASE, discrepancyPath } from '../_lib/labels';
import { DiscrepancyStatusPill, KindPill } from '../_lib/pills';

export default async function DiscrepanciesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requirePermission('inventory.discrepancy.view');
  const query = flatten(await searchParams);
  const page = await listDiscrepancies(query);
  const filtered = Boolean(query['q'] || query['status']);

  return (
    <>
      <PageHead
        back={{ href: BASE, label: 'Receiving' }}
        eyebrow="Receiving"
        title="Discrepancies"
        lede="Short, extra, damaged and wrong items found at the dock. Add notes and photos for the supplier claim, then close them."
      />
      <SectionCard
        flush
        title="Found at receiving"
        note={`${formatCount(page.total)} total`}
        toolbar={
          <ListFilters
            searchPlaceholder="Part number, supplier or GRN"
            selects={[
              {
                name: 'status',
                label: 'Status',
                defaultValue: 'OPEN',
                chips: true,
                data: [
                  { value: 'OPEN', label: 'Open' },
                  { value: 'CLOSED', label: 'Closed' },
                  { value: 'ALL', label: 'All' },
                ],
              },
            ]}
          />
        }
      >
        {page.items.length === 0 ? (
          <CardBody>
            <Empty title="No discrepancies">
              {filtered
                ? 'Try a different search or filter.'
                : 'Deliveries so far have matched.'}
            </Empty>
          </CardBody>
        ) : (
          <>
            <Box visibleFrom="md">
              <Table>
                <TableThead>
                  <TableTr>
                    <TableTh>Kind</TableTh>
                    <TableTh>Part</TableTh>
                    <TableTh ta="right">Quantity</TableTh>
                    <TableTh>Supplier</TableTh>
                    <TableTh>GRN</TableTh>
                    <TableTh>Found</TableTh>
                    <TableTh>Status</TableTh>
                  </TableTr>
                </TableThead>
                <TableTbody>
                  {page.items.map((d) => (
                    <TableTr key={d.id}>
                      <TableTd>
                        <KindPill kind={d.kind} />
                      </TableTd>
                      <TableTd>
                        <Link href={discrepancyPath(d.id)} className="dax-link">
                          <Mono>{d.item.partNo}</Mono>
                        </Link>
                        <span className="dax-sub">{d.item.description}</span>
                      </TableTd>
                      <TableTd className="dax-num">
                        {formatQty(d.qty)}{' '}
                        <span className="dax-muted">{d.item.uom}</span>
                      </TableTd>
                      <TableTd>{d.supplier.name}</TableTd>
                      <TableTd>
                        <Mono>{d.grn.number ?? 'Draft'}</Mono>
                      </TableTd>
                      <TableTd>{formatDateTime(d.createdAt)}</TableTd>
                      <TableTd>
                        <DiscrepancyStatusPill status={d.status} />
                      </TableTd>
                    </TableTr>
                  ))}
                </TableTbody>
              </Table>
            </Box>
            <Box hiddenFrom="md" className="dax-rows">
              {page.items.map((d) => (
                <Link
                  key={d.id}
                  href={discrepancyPath(d.id)}
                  className="dax-row"
                  style={{ color: 'inherit', textDecoration: 'none' }}
                >
                  <div className="dax-row-main">
                    <span className="dax-chips" style={{ gap: 4 }}>
                      <KindPill kind={d.kind} />
                      <DiscrepancyStatusPill status={d.status} />
                    </span>
                    <b style={{ fontSize: 17 }}>
                      <Mono>{d.item.partNo}</Mono> · {formatQty(d.qty)}{' '}
                      {d.item.uom}
                    </b>
                    <span>{d.item.description}</span>
                    <span className="dax-sub">
                      {d.supplier.name} · <Mono>{d.grn.number ?? 'Draft'}</Mono>
                    </span>
                  </div>
                </Link>
              ))}
            </Box>
          </>
        )}
        <Pager
          path={`${BASE}/discrepancies`}
          query={query}
          total={page.total}
          page={page.page}
          limit={page.limit}
        />
      </SectionCard>
    </>
  );
}
