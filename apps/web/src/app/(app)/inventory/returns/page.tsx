import {
  canDo,
  CardBody,
  Empty,
  LinkList,
  Mono,
  PageHead,
  Pager,
  SectionCard,
} from '@dax/web-shell';
import { LinkButton } from '../../../../components/links';
import { ListFilters } from '../../../../components/list-filters';
import { formatCount, formatDateTime } from '../../../../lib/format';
import { flatten, type SearchParams } from '../../../../lib/query';
import { requirePermission } from '../../../../lib/server';
import { listReturns } from './_lib/data';
import { BASE, RETURN_FILTERS, returnPath } from './_lib/labels';
import { ReturnStatusPill } from './_lib/pills';

export default async function ReturnListPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const caps = await requirePermission('inventory.return_note.view');
  const query = flatten(await searchParams);
  const page = await listReturns(query);
  const filtered = Boolean(query['q'] || query['status']);

  return (
    <>
      <PageHead
        eyebrow="Inventory"
        title="Returns"
        lede="Parts coming back from jobs. Good parts go back to a bin, damaged parts to quarantine and faulty parts are tagged for warranty."
        actions={
          canDo(caps, 'inventory.return_note.create') ? (
            <LinkButton href={`${BASE}/new`}>New return</LinkButton>
          ) : null
        }
      />
      <SectionCard
        flush
        title="Return notes"
        note={`${formatCount(page.total)} total`}
        toolbar={
          <ListFilters
            searchPlaceholder="Return, AOD, job or department"
            selects={[
              {
                name: 'status',
                label: 'Status',
                defaultValue: 'ALL',
                chips: true,
                data: RETURN_FILTERS,
              },
            ]}
          />
        }
      >
        <CardBody>
          {page.items.length === 0 ? (
            <Empty title="No returns found">
              {filtered
                ? 'Try a different filter.'
                : 'Nothing has come back from a job yet.'}
            </Empty>
          ) : (
            <LinkList
              items={page.items.map((r) => ({
                key: r.id,
                href: returnPath(r.id),
                title: (
                  <>
                    <Mono>{r.number ?? 'Draft'}</Mono> · {r.department.name}
                    {r.customer ? ` · ${r.customer.name}` : ''}
                  </>
                ),
                sub: [
                  r.aod ? `AOD ${r.aod.number ?? ''}` : 'No AOD',
                  r.jobNumber ? `Job ${r.jobNumber}` : null,
                  `${r.lineCount} ${r.lineCount === 1 ? 'line' : 'lines'}`,
                  formatDateTime(r.postedAt ?? r.createdAt),
                ]
                  .filter(Boolean)
                  .join(' · '),
                aside: <ReturnStatusPill status={r.status} />,
              }))}
            />
          )}
        </CardBody>
        <Pager
          path={BASE}
          query={query}
          total={page.total}
          page={page.page}
          limit={page.limit}
        />
      </SectionCard>
    </>
  );
}
