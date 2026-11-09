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
import type { MrnSummary } from '@dax/inventory-contract';
import {
  canDo,
  CardBody,
  Empty,
  Mono,
  PageHead,
  SectionCard,
} from '@dax/web-shell';
import { LinkButton } from '../../../../../components/links';
import { ListFilters } from '../../../../../components/list-filters';
import { Pager } from '../../../../../components/pager';
import { formatDateTime } from '../../../../../lib/format';
import { flatten, type SearchParams } from '../../../../../lib/query';
import { requirePermission } from '../../../../../lib/server';
import { listMrns } from '../_lib/data';
import { BASE, MRN_FILTERS, MRN_SUBTYPE_LABELS, mrnPath } from '../_lib/labels';
import { MrnStatusPill, WaitingPill } from '../_lib/pills';

function who(m: MrnSummary): string {
  return [
    m.department.name,
    m.customer?.name,
    m.jobNumber ? `Job ${m.jobNumber}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

export default async function MrnListPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const caps = await requirePermission('inventory.mrn.view');
  const query = flatten(await searchParams);
  const page = await listMrns(query);
  const filtered = Boolean(query['q'] || query['status']);

  return (
    <>
      <PageHead
        back={{ href: BASE, label: 'Issuing' }}
        eyebrow="Issuing"
        title="Requests"
        lede="Material requests from departments. Checking reserves what is free; the rest waits."
        actions={
          canDo(caps, 'inventory.mrn.create') ? (
            <LinkButton href={`${BASE}/mrns/new`}>New request</LinkButton>
          ) : null
        }
      />
      <SectionCard
        flush
        title="MRNs"
        note={`${page.items.length}${page.nextCursor ? '+' : ''} shown`}
        toolbar={
          <ListFilters
            searchPlaceholder="MRN number, job number or customer"
            selects={[
              {
                name: 'status',
                label: 'Status',
                defaultValue: 'OPEN',
                chips: true,
                data: MRN_FILTERS,
              },
            ]}
          />
        }
      >
        {page.items.length === 0 ? (
          <CardBody>
            <Empty title="No requests found">
              {filtered
                ? 'Try a different search or filter.'
                : 'Nothing is open right now.'}
            </Empty>
          </CardBody>
        ) : (
          <>
            <Box visibleFrom="md">
              <Table>
                <TableThead>
                  <TableTr>
                    <TableTh>MRN</TableTh>
                    <TableTh>Type</TableTh>
                    <TableTh>For</TableTh>
                    <TableTh ta="right">Lines</TableTh>
                    <TableTh>Created</TableTh>
                    <TableTh>Status</TableTh>
                  </TableTr>
                </TableThead>
                <TableTbody>
                  {page.items.map((m) => (
                    <TableTr key={m.id}>
                      <TableTd>
                        <Link href={mrnPath(m.id)} className="dax-link">
                          <Mono>{m.number ?? 'Draft'}</Mono>
                        </Link>
                      </TableTd>
                      <TableTd>{MRN_SUBTYPE_LABELS[m.subtype]}</TableTd>
                      <TableTd>{who(m)}</TableTd>
                      <TableTd className="dax-num">{m.lineCount}</TableTd>
                      <TableTd>{formatDateTime(m.createdAt)}</TableTd>
                      <TableTd>
                        <span className="dax-chips" style={{ gap: 4 }}>
                          <MrnStatusPill status={m.status} />
                          <WaitingPill count={m.waitingLines} />
                        </span>
                      </TableTd>
                    </TableTr>
                  ))}
                </TableTbody>
              </Table>
            </Box>
            <Box hiddenFrom="md" className="dax-rows">
              {page.items.map((m) => (
                <Link
                  key={m.id}
                  href={mrnPath(m.id)}
                  className="dax-row"
                  style={{ color: 'inherit', textDecoration: 'none' }}
                >
                  <div className="dax-row-main">
                    <b style={{ fontSize: 17 }}>
                      <Mono>{m.number ?? 'Draft'}</Mono>{' '}
                      <span className="dax-muted" style={{ fontWeight: 500 }}>
                        {MRN_SUBTYPE_LABELS[m.subtype]}
                      </span>
                    </b>
                    <span>{who(m)}</span>
                    <span className="dax-sub">
                      {m.lineCount} {m.lineCount === 1 ? 'line' : 'lines'} ·{' '}
                      {formatDateTime(m.createdAt)}
                    </span>
                    <span className="dax-chips" style={{ gap: 4 }}>
                      <MrnStatusPill status={m.status} />
                      <WaitingPill count={m.waitingLines} />
                    </span>
                  </div>
                </Link>
              ))}
            </Box>
          </>
        )}
      </SectionCard>
      <Pager path={`${BASE}/mrns`} query={query} nextCursor={page.nextCursor} />
    </>
  );
}
