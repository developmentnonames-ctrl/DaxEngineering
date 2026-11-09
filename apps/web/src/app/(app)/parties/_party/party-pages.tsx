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
  Facts,
  Mono,
  PageHead,
  Pill,
  SectionCard,
} from '@dax/web-shell';
import { ConfirmAction } from '../../../../components/confirm-action';
import { ImportScreen } from '../../../../components/import-screen';
import { LinkButton } from '../../../../components/links';
import { ListFilters } from '../../../../components/list-filters';
import { Pager } from '../../../../components/pager';
import { formatDateTime } from '../../../../lib/format';
import { uuidParam } from '../../../../lib/load';
import { flatten, type SearchParams } from '../../../../lib/query';
import { requirePermission } from '../../../../lib/server';
import { setPartyArchived } from './actions';
import {
  CONTACT_FIELDS,
  PARTIES,
  type PartyDto,
  type PartyKind,
} from './config';
import { getParty, listParties } from './data';
import { PartyForm } from './party-form';

const EYEBROW = 'Parties';

function shown(party: PartyDto, key: string): string {
  if (!(key in party)) return 'Hidden';
  const v = (party as Record<string, unknown>)[key];
  return typeof v === 'string' && v ? v : '—';
}

function StatusPill({ active }: { active: boolean }) {
  return active ? <Pill tone="ok">Active</Pill> : <Pill>Archived</Pill>;
}

export async function PartyListPage({
  kind,
  searchParams,
}: {
  kind: PartyKind;
  searchParams: SearchParams;
}) {
  const config = PARTIES[kind];
  const caps = await requirePermission(`${config.permission}.view`);
  const query = flatten(await searchParams);
  const { items, nextCursor } = await listParties(kind, query);
  const isSupplier = kind === 'supplier';
  const href = (p: PartyDto) => `${config.base}/${p.id}`;

  return (
    <>
      <PageHead
        eyebrow={EYEBROW}
        title={config.title}
        lede={
          isSupplier
            ? 'Local and foreign suppliers, with contacts and phone numbers.'
            : 'Customers with their contacts, phone numbers and addresses.'
        }
        actions={
          <>
            {canDo(caps, `${config.permission}.import`) ? (
              <LinkButton href={`${config.base}/import`} variant="default">
                Import CSV
              </LinkButton>
            ) : null}
            {canDo(caps, `${config.permission}.create`) ? (
              <LinkButton href={`${config.base}/new`}>
                New {config.noun}
              </LinkButton>
            ) : null}
          </>
        }
      />
      <SectionCard
        flush
        title={`All ${config.noun}s`}
        note={`${items.length}${nextCursor ? '+' : ''} shown`}
        toolbar={
          <ListFilters
            searchPlaceholder="Name, code or phone"
            selects={[
              {
                name: 'active',
                label: 'Show',
                defaultValue: 'true',
                chips: true,
                data: [
                  { value: 'true', label: 'Active' },
                  { value: 'false', label: 'Archived' },
                  { value: 'all', label: 'All' },
                ],
              },
            ]}
          />
        }
      >
        {items.length === 0 ? (
          <CardBody>
            <Empty title={`No ${config.noun}s found`}>
              {query['q']
                ? 'Try a different search.'
                : `Add a ${config.noun} or import a CSV file.`}
            </Empty>
          </CardBody>
        ) : (
          <>
            <Box visibleFrom="md">
              <Table>
                <TableThead>
                  <TableTr>
                    <TableTh>Code</TableTh>
                    <TableTh>Name</TableTh>
                    <TableTh>Contact person</TableTh>
                    <TableTh>Phone</TableTh>
                    <TableTh>{isSupplier ? 'Country' : 'Email'}</TableTh>
                    <TableTh />
                  </TableTr>
                </TableThead>
                <TableTbody>
                  {items.map((p) => (
                    <TableTr key={p.id}>
                      <TableTd>
                        <Mono>{p.code}</Mono>
                      </TableTd>
                      <TableTd>
                        <Link href={href(p)} className="dax-link">
                          {p.name}
                        </Link>
                      </TableTd>
                      <TableTd>{shown(p, 'contactPerson')}</TableTd>
                      <TableTd>{shown(p, 'phone')}</TableTd>
                      <TableTd>
                        {isSupplier ? shown(p, 'country') : shown(p, 'email')}
                      </TableTd>
                      <TableTd>
                        <div
                          className="dax-chips"
                          style={{ gap: 4, justifyContent: 'flex-end' }}
                        >
                          {isSupplier && p.isForeign ? (
                            <Pill tone="ext">Foreign</Pill>
                          ) : null}
                          {p.active ? null : <Pill>Archived</Pill>}
                        </div>
                      </TableTd>
                    </TableTr>
                  ))}
                </TableTbody>
              </Table>
            </Box>
            <Box hiddenFrom="md" className="dax-rows">
              {items.map((p) => (
                <div key={p.id} className="dax-row">
                  <div className="dax-row-main">
                    <Link
                      href={href(p)}
                      className="dax-link"
                      style={{ fontSize: 17 }}
                    >
                      {p.name}
                    </Link>
                    <span className="dax-sub">
                      <Mono>{p.code}</Mono>
                      {'phone' in p && p.phone ? ` · ${p.phone}` : ''}
                    </span>
                    <div className="dax-chips" style={{ gap: 4 }}>
                      {isSupplier && p.isForeign ? (
                        <Pill tone="ext">Foreign</Pill>
                      ) : null}
                      {p.active ? null : <Pill>Archived</Pill>}
                    </div>
                  </div>
                </div>
              ))}
            </Box>
          </>
        )}
      </SectionCard>
      <Pager path={config.base} query={query} nextCursor={nextCursor} />
    </>
  );
}

export async function PartyNewPage({ kind }: { kind: PartyKind }) {
  const config = PARTIES[kind];
  await requirePermission(`${config.permission}.create`);
  return (
    <>
      <PageHead
        back={{ href: config.base, label: config.title }}
        eyebrow={EYEBROW}
        title={`New ${config.noun}`}
        lede="The code is given automatically when you save."
      />
      <SectionCard title="Details">
        <PartyForm kind={kind} />
      </SectionCard>
    </>
  );
}

export async function PartyDetailPage({
  kind,
  params,
}: {
  kind: PartyKind;
  params: Promise<{ id: string }>;
}) {
  const config = PARTIES[kind];
  const caps = await requirePermission(`${config.permission}.view`);
  const id = await uuidParam(params);
  const party = await getParty(kind, id);
  const canEdit = canDo(caps, `${config.permission}.edit`) && party.active;
  const canArchive = canDo(caps, `${config.permission}.archive`);

  return (
    <>
      <PageHead
        back={{ href: config.base, label: config.title }}
        eyebrow={
          <>
            <Mono>{party.code}</Mono> · Updated{' '}
            {formatDateTime(party.updatedAt)}
          </>
        }
        title={party.name}
        actions={
          canArchive ? (
            <ConfirmAction
              action={setPartyArchived}
              payload={{
                kind,
                id: party.id,
                version: party.version,
                archive: party.active,
              }}
              label={party.active ? 'Archive' : 'Restore'}
              title={
                party.active
                  ? `Archive ${party.name}?`
                  : `Restore ${party.name}?`
              }
              message={
                party.active
                  ? `Archived ${config.noun}s are hidden from lists and pickers. Their history stays, and you can restore them later.`
                  : `${party.name} will appear in lists and pickers again.`
              }
              color={party.active ? 'red' : undefined}
            />
          ) : null
        }
      />
      <div className="dax-chips">
        <StatusPill active={party.active} />
        {kind === 'supplier' ? (
          <Pill tone={party.isForeign ? 'ext' : 'int'}>
            {party.isForeign ? 'Foreign' : 'Local'}
          </Pill>
        ) : null}
      </div>
      <SectionCard title="Details">
        {canEdit ? (
          <PartyForm key={party.version} kind={kind} party={party} />
        ) : (
          <Facts
            items={[
              ...(kind === 'supplier'
                ? [
                    { label: 'Country', value: shown(party, 'country') },
                    {
                      label: 'Type',
                      value: party.isForeign ? 'Foreign' : 'Local',
                    },
                  ]
                : []),
              ...CONTACT_FIELDS.map((f) => ({
                label: f.label,
                value: (
                  <span style={{ whiteSpace: 'pre-wrap' }}>
                    {shown(party, f.key)}
                  </span>
                ),
              })),
            ]}
          />
        )}
      </SectionCard>
    </>
  );
}

export async function PartyImportPage({ kind }: { kind: PartyKind }) {
  const config = PARTIES[kind];
  await requirePermission(`${config.permission}.import`);
  return (
    <>
      <PageHead
        back={{ href: config.base, label: config.title }}
        eyebrow={EYEBROW}
        title={`Import ${config.noun}s`}
        lede={`Add many ${config.noun}s at once from a CSV file.`}
      />
      <ImportScreen
        kind={config.importKind}
        noun={config.noun}
        columns={config.columns}
        backHref={config.base}
        notes={[
          'Only the name is required; leave other columns empty if unknown.',
          'Save the file as CSV (UTF-8) from Excel or Google Sheets.',
        ]}
      />
    </>
  );
}
