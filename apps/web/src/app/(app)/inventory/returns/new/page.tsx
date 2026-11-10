import { notFound } from 'next/navigation';
import type { ReturnableAod } from '@dax/inventory-contract';
import {
  canDo,
  CardBody,
  Empty,
  Facts,
  LinkList,
  Mono,
  PageHead,
  SearchBox,
  SectionCard,
} from '@dax/web-shell';
import { LinkButton } from '../../../../../components/links';
import { formatDateTime } from '../../../../../lib/format';
import { isUuid } from '../../../../../lib/load';
import { flatten, type SearchParams } from '../../../../../lib/query';
import { requirePermission } from '../../../../../lib/server';
import { getDepartments } from '../../issuing/_lib/data';
import { findReturnableAod, listReturnableAods } from '../_lib/data';
import { BASE, FREE_RETURN_PATH, newReturnFromAod } from '../_lib/labels';
import { ReturnForm } from '../_lib/return-form';

function AodFacts({ aod }: { aod: ReturnableAod }) {
  return (
    <SectionCard title="Against AOD">
      <Facts
        items={[
          { label: 'AOD', value: <Mono>{aod.number ?? '—'}</Mono> },
          { label: 'Request', value: <Mono>{aod.mrn.number ?? '—'}</Mono> },
          { label: 'Department', value: aod.department.name },
          ...(aod.customer
            ? [{ label: 'Customer', value: aod.customer.name }]
            : []),
          { label: 'Job number', value: aod.jobNumber ?? '—' },
          {
            label: 'Issued',
            value: aod.issuedAt ? formatDateTime(aod.issuedAt) : '—',
          },
        ]}
      />
    </SectionCard>
  );
}

export default async function NewReturnPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const caps = await requirePermission('inventory.return_note.create');
  const canPost = canDo(caps, 'inventory.return_note.post');
  const query = flatten(await searchParams);
  const aodId = query['aod'];

  if (aodId) {
    if (!isUuid(aodId)) notFound();
    const aod = await findReturnableAod(aodId);
    if (!aod) notFound();
    return (
      <>
        <PageHead
          back={{ href: `${BASE}/new`, label: 'New return' }}
          eyebrow="Return against an AOD"
          title={
            <>
              From <Mono>{aod.number ?? 'AOD'}</Mono>
            </>
          }
          lede="Pick what came back, how much and its condition. The department, customer and job come from the AOD."
        />
        <AodFacts aod={aod} />
        <SectionCard>
          {aod.open ? (
            <ReturnForm mode={{ kind: 'aod', aod }} canPost={canPost} />
          ) : (
            <Empty title="This AOD can't take returns">
              Only an issued AOD can take returns.
            </Empty>
          )}
        </SectionCard>
      </>
    );
  }

  if (query['mode'] === 'free') {
    const departments = await getDepartments();
    return (
      <>
        <PageHead
          back={{ href: `${BASE}/new`, label: 'New return' }}
          eyebrow="Return without an AOD"
          title="Free return"
          lede="For parts coming back that were not issued on an AOD. Give the department and a reason."
        />
        <SectionCard>
          <ReturnForm mode={{ kind: 'free', departments }} canPost={canPost} />
        </SectionCard>
      </>
    );
  }

  const q = query['q'];
  const options = await listReturnableAods(q);
  return (
    <>
      <PageHead
        back={{ href: BASE, label: 'Returns' }}
        eyebrow="Returns"
        title="New return"
        lede="Return parts against the AOD they left on, or as a free return with a reason."
      />
      <SectionCard
        flush
        title="From an AOD"
        note={q ? 'Matching AODs' : 'Recently issued'}
        toolbar={
          <SearchBox
            action={`${BASE}/new`}
            label="Find an AOD"
            placeholder="AOD, request or job number"
            defaultValue={q}
            wide
          />
        }
      >
        <CardBody>
          {options.items.length === 0 ? (
            <Empty title="No issued AOD found">
              {q
                ? 'Check the number on the AOD and try again.'
                : 'Nothing has been issued yet.'}
            </Empty>
          ) : (
            <LinkList
              items={options.items.map((a) => ({
                key: a.id,
                href: newReturnFromAod(a.id),
                title: (
                  <>
                    <Mono>{a.number ?? 'AOD'}</Mono> · {a.department}
                    {a.customer ? ` · ${a.customer}` : ''}
                  </>
                ),
                sub: [
                  a.jobNumber ? `Job ${a.jobNumber}` : null,
                  a.issuedAt ? `Issued ${formatDateTime(a.issuedAt)}` : null,
                ]
                  .filter(Boolean)
                  .join(' · '),
              }))}
            />
          )}
        </CardBody>
      </SectionCard>
      <SectionCard title="Without an AOD">
        <div className="dax-stack" style={{ gap: 12 }}>
          <span className="dax-sub">
            For spare parts left over or found that were not issued on an AOD. A
            reason is needed.
          </span>
          <div>
            <LinkButton href={FREE_RETURN_PATH} variant="default">
              Free return
            </LinkButton>
          </div>
        </div>
      </SectionCard>
    </>
  );
}
