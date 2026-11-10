import {
  Alert,
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
  KpiTiles,
  Mono,
  PageHead,
  SectionCard,
} from '@dax/web-shell';
import { LinkButton } from '../../../../components/links';
import { ListFilters } from '../../../../components/list-filters';
import { Pager } from '../../../../components/pager';
import { formatDateTime, formatQty } from '../../../../lib/format';
import { flatten, type SearchParams } from '../../../../lib/query';
import { requirePermission } from '../../../../lib/server';
import { getWarrantyCounts, listWarranty } from './_lib/data';
import { BASE, CUSTODY_NOTE, tagPath } from './_lib/labels';
import { OutcomePill, WarrantyStatusPill } from './_lib/pills';

export default async function WarrantyListPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const caps = await requirePermission('inventory.warranty.view');
  const query = flatten(await searchParams);
  const [page, counts] = await Promise.all([
    listWarranty(query),
    getWarrantyCounts(),
  ]);
  const filtered = Boolean(query['q'] || query['status']);

  return (
    <>
      <PageHead
        eyebrow="Stores"
        title="Warranty bin"
        lede="Failed parts kept for a warranty claim, from tagging to the supplier's answer."
        actions={
          canDo(caps, 'inventory.warranty.tag') ? (
            <LinkButton href={`${BASE}/new`}>Tag a failed part</LinkButton>
          ) : null
        }
      />
      <Alert color="gray" variant="light">
        {CUSTODY_NOTE}
      </Alert>
      {counts ? (
        <KpiTiles
          items={[
            {
              label: 'In the bin, not sent',
              value: counts.tagged,
              tone: counts.tagged > 0 ? 'hi' : undefined,
              href: `${BASE}?status=TAGGED`,
            },
            {
              label: 'With suppliers, awaiting outcome',
              value: counts.sent,
              href: `${BASE}?status=SENT`,
              tone: counts.sent > 0 ? 'int' : undefined,
            },
          ]}
        />
      ) : null}
      <SectionCard
        flush
        title="Warranty tags"
        note={`${page.items.length}${page.nextCursor ? '+' : ''} shown`}
        toolbar={
          <ListFilters
            searchPlaceholder="Tag, serial, job, claim or part number"
            selects={[
              {
                name: 'status',
                label: 'Status',
                defaultValue: 'OPEN',
                chips: true,
                data: [
                  { value: 'OPEN', label: 'Open' },
                  { value: 'TAGGED', label: 'In the bin' },
                  { value: 'SENT', label: 'With supplier' },
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
            <Empty title="No warranty tags">
              {filtered
                ? 'Try a different search or filter.'
                : 'No failed parts are waiting on a claim.'}
            </Empty>
          </CardBody>
        ) : (
          <>
            <Box visibleFrom="md">
              <Table>
                <TableThead>
                  <TableTr>
                    <TableTh>Tag</TableTh>
                    <TableTh>Part</TableTh>
                    <TableTh ta="right">Quantity</TableTh>
                    <TableTh>Serial</TableTh>
                    <TableTh>Job</TableTh>
                    <TableTh>Supplier</TableTh>
                    <TableTh>Tagged</TableTh>
                    <TableTh>Status</TableTh>
                  </TableTr>
                </TableThead>
                <TableTbody>
                  {page.items.map((t) => (
                    <TableTr key={t.id}>
                      <TableTd>
                        <Link href={tagPath(t.id)} className="dax-link">
                          <Mono>{t.number}</Mono>
                        </Link>
                      </TableTd>
                      <TableTd>
                        <Mono>{t.item.partNo}</Mono>
                        <span className="dax-sub">{t.item.description}</span>
                      </TableTd>
                      <TableTd className="dax-num">
                        {formatQty(t.qty)}{' '}
                        <span className="dax-muted">{t.item.uom}</span>
                      </TableTd>
                      <TableTd>
                        {t.serialNo ? <Mono>{t.serialNo}</Mono> : '—'}
                      </TableTd>
                      <TableTd>{t.jobNumber ?? '—'}</TableTd>
                      <TableTd>
                        {t.supplier?.name ?? '—'}
                        {t.claimNumber ? (
                          <span className="dax-sub">
                            Claim <Mono>{t.claimNumber}</Mono>
                          </span>
                        ) : null}
                      </TableTd>
                      <TableTd>{formatDateTime(t.createdAt)}</TableTd>
                      <TableTd>
                        <span className="dax-chips" style={{ gap: 4 }}>
                          <WarrantyStatusPill status={t.status} />
                          <OutcomePill outcome={t.outcome} />
                        </span>
                      </TableTd>
                    </TableTr>
                  ))}
                </TableTbody>
              </Table>
            </Box>
            <Box hiddenFrom="md" className="dax-rows">
              {page.items.map((t) => (
                <Link
                  key={t.id}
                  href={tagPath(t.id)}
                  className="dax-row"
                  style={{ color: 'inherit', textDecoration: 'none' }}
                >
                  <div className="dax-row-main">
                    <span className="dax-chips" style={{ gap: 4 }}>
                      <WarrantyStatusPill status={t.status} />
                      <OutcomePill outcome={t.outcome} />
                    </span>
                    <b style={{ fontSize: 17 }}>
                      <Mono>{t.item.partNo}</Mono> · {formatQty(t.qty)}{' '}
                      {t.item.uom}
                    </b>
                    <span>{t.item.description}</span>
                    <span className="dax-sub">
                      <Mono>{t.number}</Mono>
                      {t.serialNo ? <> · SN {t.serialNo}</> : null}
                      {t.jobNumber ? ` · Job ${t.jobNumber}` : ''}
                      {t.supplier ? ` · ${t.supplier.name}` : ''}
                    </span>
                  </div>
                </Link>
              ))}
            </Box>
          </>
        )}
      </SectionCard>
      <Pager path={BASE} query={query} nextCursor={page.nextCursor} />
    </>
  );
}
