import {
  Alert,
  Autocomplete,
  Button,
  Group,
  Paper,
  Select,
  SimpleGrid,
  TextInput,
  Title,
} from '@mantine/core';
import { AdminUserList, AuditPage } from '@dax/platform-contract';
import { canDo } from '@dax/web-shell';
import { getCatalog } from '../../../lib/data';
import { unlessForbidden } from '../../../lib/load';
import { api, requirePermission } from '../../../lib/server';
import { AuditTable } from './audit-table';
import { auditPath, readFilters } from './query';

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const caps = await requirePermission('core.audit.view');
  const { filters, valid } = readFilters(await searchParams);
  const [page, catalog, users] = await Promise.all([
    api.request(auditPath(filters), (d) => AuditPage.parse(d)),
    unlessForbidden(getCatalog(), { modules: [], entities: [] }),
    canDo(caps, 'core.users.view')
      ? unlessForbidden(
          api.request('/admin/users', (d) => AdminUserList.parse(d)),
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
      <Title order={2}>Audit log</Title>
      <Paper withBorder p="md">
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
      </Paper>
      {valid ? null : (
        <Alert color="orange">
          Some filters were not valid and were ignored.
        </Alert>
      )}
      <AuditTable
        key={JSON.stringify(filters)}
        filters={filters}
        initial={page}
        entityLabels={entityLabels}
        fieldLabels={fieldLabels}
      />
    </>
  );
}
