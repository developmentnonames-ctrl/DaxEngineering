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
  canDo,
  CardBody,
  Empty,
  Mono,
  PageHead,
  Pager,
  Pill,
  SectionCard,
} from '@dax/web-shell';
import { LinkButton } from '../../../../../components/links';
import { ListFilters } from '../../../../../components/list-filters';
import { formatCount, formatDateTime } from '../../../../../lib/format';
import { flatten, type SearchParams } from '../../../../../lib/query';
import { requirePermission } from '../../../../../lib/server';
import { listGrns } from '../_lib/data';
import { BASE, grnPath, SUBTYPE_LABELS } from '../_lib/labels';
import { GrnStatusPill } from '../_lib/pills';

export default async function GrnListPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const caps = await requirePermission('inventory.grn.view');
  const query = flatten(await searchParams);
  const page = await listGrns(query);
  const filtered = Boolean(query['q'] || query['status']);

  return (
    <>
      <PageHead
        back={{ href: BASE, label: 'Receiving' }}
        eyebrow="Receiving"
        title="Goods received"
        lede="Drafts are counted at the dock. Posting assigns the GRN number and brings the stock in."
        actions={
          canDo(caps, 'inventory.grn.check') ? (
            <LinkButton href={`${BASE}/grns/new`}>
              Receive a delivery
            </LinkButton>
          ) : null
        }
      />
      <SectionCard
        flush
        title="GRNs"
        note={`${formatCount(page.total)} total`}
        toolbar={
          <ListFilters
            searchPlaceholder="GRN number, supplier or delivery note"
            selects={[
              {
                name: 'status',
                label: 'Status',
                defaultValue: 'OPEN',
                chips: true,
                data: [
                  { value: 'OPEN', label: 'Open' },
                  { value: 'DRAFT', label: 'Draft' },
                  { value: 'CHECKED', label: 'Checked' },
                  { value: 'POSTED', label: 'Posted' },
                  { value: 'PUT_AWAY', label: 'Put away' },
                  { value: 'CANCELLED', label: 'Cancelled' },
                  { value: 'REVERSED', label: 'Reversed' },
                  { value: 'ALL', label: 'All' },
                ],
              },
            ]}
          />
        }
      >
        {page.items.length === 0 ? (
          <CardBody>
            <Empty title="No GRNs found">
              {filtered
                ? 'Try a different search or filter.'
                : 'Receive a delivery to start one.'}
            </Empty>
          </CardBody>
        ) : (
          <>
            <Box visibleFrom="md">
              <Table>
                <TableThead>
                  <TableTr>
                    <TableTh>GRN</TableTh>
                    <TableTh>Supplier</TableTh>
                    <TableTh>Type</TableTh>
                    <TableTh ta="right">Lines</TableTh>
                    <TableTh>Date</TableTh>
                    <TableTh>Status</TableTh>
                  </TableTr>
                </TableThead>
                <TableTbody>
                  {page.items.map((g) => (
                    <TableTr key={g.id}>
                      <TableTd>
                        <Link href={grnPath(g.id)} className="dax-link">
                          <Mono>{g.number ?? 'Draft'}</Mono>
                        </Link>
                      </TableTd>
                      <TableTd>{g.supplier.name}</TableTd>
                      <TableTd>{SUBTYPE_LABELS[g.subtype]}</TableTd>
                      <TableTd className="dax-num">{g.lineCount}</TableTd>
                      <TableTd>
                        {formatDateTime(g.postedAt ?? g.createdAt)}
                      </TableTd>
                      <TableTd>
                        <span className="dax-chips" style={{ gap: 4 }}>
                          <GrnStatusPill status={g.status} />
                          {g.openDiscrepancies ? (
                            <Pill tone="bad">
                              {g.openDiscrepancies} discrepancies
                            </Pill>
                          ) : null}
                        </span>
                      </TableTd>
                    </TableTr>
                  ))}
                </TableTbody>
              </Table>
            </Box>
            <Box hiddenFrom="md" className="dax-rows">
              {page.items.map((g) => (
                <Link
                  key={g.id}
                  href={grnPath(g.id)}
                  className="dax-row"
                  style={{ color: 'inherit', textDecoration: 'none' }}
                >
                  <div className="dax-row-main">
                    <b style={{ fontSize: 17 }}>
                      <Mono>{g.number ?? 'Draft'}</Mono>
                    </b>
                    <span>{g.supplier.name}</span>
                    <span className="dax-sub">
                      {g.lineCount} {g.lineCount === 1 ? 'line' : 'lines'} ·{' '}
                      {formatDateTime(g.postedAt ?? g.createdAt)}
                    </span>
                    <span className="dax-chips" style={{ gap: 4 }}>
                      <GrnStatusPill status={g.status} />
                      {g.openDiscrepancies ? (
                        <Pill tone="bad">
                          {g.openDiscrepancies} discrepancies
                        </Pill>
                      ) : null}
                    </span>
                  </div>
                </Link>
              ))}
            </Box>
          </>
        )}
        <Pager
          path={`${BASE}/grns`}
          query={query}
          total={page.total}
          page={page.page}
          limit={page.limit}
        />
      </SectionCard>
    </>
  );
}
