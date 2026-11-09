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
import type { AodSummary } from '@dax/inventory-contract';
import { CardBody, Empty, Mono, PageHead, SectionCard } from '@dax/web-shell';
import { ListFilters } from '../../../../../components/list-filters';
import { Pager } from '../../../../../components/pager';
import { formatDateTime } from '../../../../../lib/format';
import { flatten, type SearchParams } from '../../../../../lib/query';
import { requirePermission } from '../../../../../lib/server';
import { listAods } from '../_lib/data';
import { AOD_TYPE_LABELS, aodPath, BASE } from '../_lib/labels';
import { AodStatusPill } from '../_lib/pills';

function who(a: AodSummary): string {
  return [a.department.name, a.customer?.name].filter(Boolean).join(' · ');
}

export default async function AodListPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requirePermission('inventory.aod.view');
  const query = flatten(await searchParams);
  const page = await listAods(query);
  const filtered = Boolean(query['q'] || query['status']);

  return (
    <>
      <PageHead
        back={{ href: BASE, label: 'Issuing' }}
        eyebrow="Issuing"
        title="Dispatch notes"
        lede="An AOD is complete only when its signed copy is uploaded."
      />
      <SectionCard
        flush
        title="AODs"
        note={`${page.items.length}${page.nextCursor ? '+' : ''} shown`}
        toolbar={
          <ListFilters
            searchPlaceholder="AOD or MRN number"
            selects={[
              {
                name: 'status',
                label: 'Status',
                defaultValue: 'OPEN',
                chips: true,
                data: [
                  { value: 'OPEN', label: 'Open' },
                  { value: 'PICKING', label: 'Picking' },
                  { value: 'ISSUED', label: 'Awaiting signature' },
                  { value: 'SIGNED', label: 'Signed' },
                  { value: 'ALL', label: 'All' },
                ],
              },
            ]}
          />
        }
      >
        {page.items.length === 0 ? (
          <CardBody>
            <Empty title="No dispatch notes found">
              {filtered
                ? 'Try a different search or filter.'
                : 'Start picking from a checked request.'}
            </Empty>
          </CardBody>
        ) : (
          <>
            <Box visibleFrom="md">
              <Table>
                <TableThead>
                  <TableTr>
                    <TableTh>AOD</TableTh>
                    <TableTh>Type</TableTh>
                    <TableTh>Request</TableTh>
                    <TableTh>For</TableTh>
                    <TableTh ta="right">Lines</TableTh>
                    <TableTh>Date</TableTh>
                    <TableTh>Status</TableTh>
                  </TableTr>
                </TableThead>
                <TableTbody>
                  {page.items.map((a) => (
                    <TableTr key={a.id}>
                      <TableTd>
                        <Link href={aodPath(a.id)} className="dax-link">
                          <Mono>{a.number ?? 'Picking'}</Mono>
                        </Link>
                      </TableTd>
                      <TableTd>{AOD_TYPE_LABELS[a.type]}</TableTd>
                      <TableTd>
                        <Mono>{a.mrn.number ?? '—'}</Mono>
                      </TableTd>
                      <TableTd>{who(a)}</TableTd>
                      <TableTd className="dax-num">{a.lineCount}</TableTd>
                      <TableTd>
                        {formatDateTime(a.issuedAt ?? a.createdAt)}
                      </TableTd>
                      <TableTd>
                        <AodStatusPill status={a.status} />
                      </TableTd>
                    </TableTr>
                  ))}
                </TableTbody>
              </Table>
            </Box>
            <Box hiddenFrom="md" className="dax-rows">
              {page.items.map((a) => (
                <Link
                  key={a.id}
                  href={aodPath(a.id)}
                  className="dax-row"
                  style={{ color: 'inherit', textDecoration: 'none' }}
                >
                  <div className="dax-row-main">
                    <b style={{ fontSize: 17 }}>
                      <Mono>{a.number ?? 'Picking'}</Mono>
                    </b>
                    <span>{who(a)}</span>
                    <span className="dax-sub">
                      {AOD_TYPE_LABELS[a.type]} ·{' '}
                      <Mono>{a.mrn.number ?? '—'}</Mono> ·{' '}
                      {formatDateTime(a.issuedAt ?? a.createdAt)}
                    </span>
                    <span>
                      <AodStatusPill status={a.status} />
                    </span>
                  </div>
                </Link>
              ))}
            </Box>
          </>
        )}
      </SectionCard>
      <Pager path={`${BASE}/aods`} query={query} nextCursor={page.nextCursor} />
    </>
  );
}
