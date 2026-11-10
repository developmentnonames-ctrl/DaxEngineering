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
import { LinkButton } from '../../../../../components/links';
import { ListFilters } from '../../../../../components/list-filters';
import { formatCount, formatDateTime } from '../../../../../lib/format';
import { flatten, type SearchParams } from '../../../../../lib/query';
import { requirePermission } from '../../../../../lib/server';
import { listHolds } from '../_lib/data';
import { BASE, holdPath } from '../_lib/labels';
import { HoldStatusPill } from '../_lib/pills';

export default async function HoldListPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const caps = await requirePermission('inventory.hold.view');
  const query = flatten(await searchParams);
  const page = await listHolds(query);
  const filtered = Boolean(query['q'] || query['status']);

  return (
    <>
      <PageHead
        back={{ href: BASE, label: 'Issuing' }}
        eyebrow="Issuing"
        title="Holds"
        lede="Stock kept aside. Holds never expire; release them or turn them into a request."
        actions={
          canDo(caps, 'inventory.hold.create') ? (
            <LinkButton href={`${BASE}/holds/new`}>New hold</LinkButton>
          ) : null
        }
      />
      <SectionCard
        flush
        title="Holds"
        note={`${formatCount(page.total)} total`}
        toolbar={
          <ListFilters
            searchPlaceholder="Hold number or customer"
            selects={[
              {
                name: 'status',
                label: 'Status',
                defaultValue: 'ACTIVE',
                chips: true,
                data: [
                  { value: 'ACTIVE', label: 'Active' },
                  { value: 'CONVERTED', label: 'Converted' },
                  { value: 'RELEASED', label: 'Released' },
                  { value: 'ALL', label: 'All' },
                ],
              },
            ]}
          />
        }
      >
        <CardBody>
          {page.items.length === 0 ? (
            <Empty title="No holds found">
              {filtered
                ? 'Try a different filter.'
                : 'No stock is held right now.'}
            </Empty>
          ) : (
            <LinkList
              items={page.items.map((h) => ({
                key: h.id,
                href: holdPath(h.id),
                title: (
                  <>
                    <Mono>{h.number}</Mono> · {h.department.name}
                    {h.customer ? ` · ${h.customer.name}` : ''}
                  </>
                ),
                sub: `${h.lineCount} ${h.lineCount === 1 ? 'line' : 'lines'} · ${formatDateTime(h.createdAt)}`,
                aside: <HoldStatusPill status={h.status} />,
              }))}
            />
          )}
        </CardBody>
        <Pager
          path={`${BASE}/holds`}
          query={query}
          total={page.total}
          page={page.page}
          limit={page.limit}
        />
      </SectionCard>
    </>
  );
}
