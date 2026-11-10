import {
  Alert,
  Autocomplete,
  Button,
  Group,
  Select,
  SimpleGrid,
  TextInput,
} from '@mantine/core';
import { AdminUserList, AuditPage } from '@dax/platform-contract';
import { canDo, PageHead, Pager, SectionCard } from '@dax/web-shell';
import { getCatalog } from '../../../lib/data';
import { unlessForbidden } from '../../../lib/load';
import { api, requirePermission } from '../../../lib/server';
import { AuditTable } from './audit-table';
import { auditPath, readFilters, readPaging } from './query';

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const caps = await requirePermission('core.audit.view');
  const params = await searchParams;
  const { filters, valid } = readFilters(params);
  const paging = readPaging(params);
  const [page, catalog, users] = await Promise.all([
    api.request(auditPath(filters, paging), (d) => AuditPage.parse(d)),
    unlessForbidden(getCatalog(), { modules: [], entities: [] }),
    canDo(caps, 'core.users.view')
      ? unlessForbidden(
          // Every user, for the "User" filter.
          api.request('/admin/users?limit=500', (d) => ({
            users: AdminUserList.parse(d).users,
          })),
          { users: [] },
        )
      : Promise.resolve({ users: [] }),
  ]);

  const entityLabels: Record<string, string> = {};
  const fieldLabels: Record<string, string> = {};
  for (const entity of catalog.entities) {
    entityLabels[entity.key] = entity.label;
    for (const field of entity.fields) {
      fieldLabels[`${entity.key}.${field.name}`] = field.label;
    }
  }
  const entityKeys = [
    ...new Set([
      ...Object.keys(entityLabels),
      ...page.entries.map((e) => e.entityKey),
    ]),
  ].sort();
  const userOptions = users.users.map((u) => ({ value: u.id, label: u.name }));
  if (
    filters.actorId &&
    !userOptions.some((u) => u.value === filters.actorId)
  ) {
    userOptions.push({ value: filters.actorId, label: 'Selected user' });
  }

  return (
    <>
      <PageHead
        eyebrow="Admin · History"
        title="Audit log"
        lede="Every change to users, roles and records: who made it, when, and what changed."
      />
      <SectionCard title="Filters">
        <form method="get" action="/audit">
          <SimpleGrid cols={{ base: 1, xs: 2, md: 3 }} spacing="sm">
            <Autocomplete
              name="entityKey"
              label="Record type"
              placeholder="Any"
              data={entityKeys}
              defaultValue={filters.entityKey ?? ''}
            />
            <TextInput
              name="entityId"
              label="Record ID"
              placeholder="Any"
              defaultValue={filters.entityId ?? ''}
            />
            <Select
              name="actorId"
              label="User"
              placeholder="Anyone"
              data={userOptions}
              defaultValue={filters.actorId ?? null}
              searchable
              clearable
            />
            <TextInput
              name="action"
              label="Action"
              placeholder="For example update"
              defaultValue={filters.action ?? ''}
            />
            <TextInput
              name="from"
              type="date"
              label="From"
              defaultValue={filters.from ?? ''}
            />
            <TextInput
              name="to"
              type="date"
              label="To"
              defaultValue={filters.to ?? ''}
            />
          </SimpleGrid>
          <Group mt="md" gap="sm">
            <Button type="submit">Filter</Button>
            <Button component="a" href="/audit" variant="default">
              Clear
            </Button>
          </Group>
        </form>
      </SectionCard>
      {valid ? null : (
        <Alert color="orange">
          Some filters were not valid and were ignored.
        </Alert>
      )}
      <AuditTable
        key={`${JSON.stringify(filters)}-${page.page}-${page.limit}`}
        entries={page.entries}
        pager={
          <Pager
            path="/audit"
            query={Object.fromEntries(
              Object.entries(filters).map(([k, v]) => [k, v ?? undefined]),
            )}
            total={page.total}
            page={page.page}
            limit={page.limit}
          />
        }
        entityLabels={entityLabels}
        fieldLabels={fieldLabels}
      />
    </>
  );
}
