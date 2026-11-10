import {
  canDo,
  CardBody,
  Empty,
  LinkList,
  Mono,
  PageHead,
  SectionCard,
} from '@dax/web-shell';
import { LinkButton } from '../../../../components/links';
import { ListFilters } from '../../../../components/list-filters';
import { Pager } from '../../../../components/pager';
import { formatDateTime } from '../../../../lib/format';
import { flatten, type SearchParams } from '../../../../lib/query';
import { requirePermission } from '../../../../lib/server';
import { listCounts } from './_lib/data';
import {
  BASE,
  COUNT_FILTERS,
  COUNT_KIND_LABELS,
  COUNT_KIND_OPTIONS,
  countPath,
} from './_lib/labels';
import { BlindPill, CountStatusPill } from './_lib/pills';

export default async function CountListPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const caps = await requirePermission('inventory.count.view');
  const query = flatten(await searchParams);
  const page = await listCounts(query);
  const filtered = Boolean(query['q'] || query['status'] || query['kind']);

  return (
    <>
      <PageHead
        eyebrow="Inventory"
        title="Stock counts"
        lede="Count bins, review the differences, and post them once the Stores Manager approves. Bins being counted are frozen until the count is posted or cancelled."
        actions={
          canDo(caps, 'inventory.count.create') ? (
            <LinkButton href={`${BASE}/new`}>New count</LinkButton>
          ) : null
        }
      />
      <SectionCard
        flush
        title="Counts"
        note={`${page.items.length}${page.nextCursor ? '+' : ''} shown`}
        toolbar={
          <ListFilters
            searchPlaceholder="Count number"
            selects={[
              {
                name: 'status',
                label: 'Status',
                defaultValue: 'OPEN',
                chips: true,
                data: COUNT_FILTERS,
              },
              { name: 'kind', label: 'Kind', data: COUNT_KIND_OPTIONS },
            ]}
          />
        }
      >
        <CardBody>
          {page.items.length === 0 ? (
            <Empty title="No counts found">
              {filtered
                ? 'Try a different filter.'
                : 'No count is in progress right now.'}
            </Empty>
          ) : (
            <LinkList
              items={page.items.map((c) => ({
                key: c.id,
                href: countPath(c.id),
                title: (
                  <>
                    <Mono>{c.number}</Mono> · {COUNT_KIND_LABELS[c.kind]} count
                  </>
                ),
                sub: `${c.countedLines} of ${c.lineCount} ${c.lineCount === 1 ? 'line' : 'lines'} counted · ${formatDateTime(c.createdAt)}`,
                aside: (
                  <span className="dax-chips" style={{ gap: 4 }}>
                    <BlindPill blind={c.blind} />
                    <CountStatusPill status={c.status} />
                  </span>
                ),
              }))}
            />
          )}
        </CardBody>
      </SectionCard>
      <Pager path={BASE} query={query} nextCursor={page.nextCursor} />
    </>
  );
}
