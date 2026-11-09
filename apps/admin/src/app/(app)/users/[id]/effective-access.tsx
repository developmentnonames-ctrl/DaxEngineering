import {
  Alert,
  Badge,
  Group,
  Paper,
  Stack,
  Table,
  TableScrollContainer,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
  Text,
  Title,
} from '@mantine/core';
import type { AdminCatalog, EffectiveAccess } from '@dax/platform-contract';
import type { PermissionInfo } from '../../../../lib/catalog';
import { SCOPE_LABELS } from '../../../../lib/format';

const SOURCE_LABELS: Record<
  EffectiveAccess['permissions'][number]['source'],
  string
> = {
  role: 'Role',
  override: 'Single grant',
  super_admin: 'Super admin',
};

function FieldList({ names }: { names: string[] }) {
  if (names.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        None
      </Text>
    );
  }
  return (
    <Group gap={4}>
      {names.map((n) => (
        <Badge key={n} variant="light" color="gray">
          {n}
        </Badge>
      ))}
    </Group>
  );
}

export function EffectiveAccessView({
  access,
  catalog,
  permissions,
}: {
  access: EffectiveAccess;
  catalog: AdminCatalog;
  permissions: Map<string, PermissionInfo>;
}) {
  const label = (key: string) => permissions.get(key)?.label ?? key;
  const entities = new Map(catalog.entities.map((e) => [e.key, e]));
  const fieldLabel = (entityKey: string, name: string) =>
    entities.get(entityKey)?.fields.find((f) => f.name === name)?.label ?? name;
  const sorted = [...access.permissions].sort((a, b) =>
    label(a.key).localeCompare(label(b.key)),
  );

  return (
    <Stack maw={900}>
      {access.isSuperAdmin ? (
        <Alert color="red">Super admins have every permission.</Alert>
      ) : null}
      <Text size="sm">
        Two-step sign-in is{' '}
        <strong>{access.require2fa ? 'required' : 'not required'}</strong> by
        this user's roles.
      </Text>

      <Paper withBorder p="lg">
        <Stack>
          <Title order={4}>Permissions</Title>
          {sorted.length === 0 ? (
            <Text size="sm" c="dimmed">
              No permissions.
            </Text>
          ) : (
            <TableScrollContainer minWidth={560}>
              <Table striped>
                <TableThead>
                  <TableTr>
                    <TableTh>Permission</TableTh>
                    <TableTh>Scope</TableTh>
                    <TableTh>From</TableTh>
                  </TableTr>
                </TableThead>
                <TableTbody>
                  {sorted.map((p) => (
                    <TableTr key={p.key}>
                      <TableTd>{label(p.key)}</TableTd>
                      <TableTd>{SCOPE_LABELS[p.scope]}</TableTd>
                      <TableTd>{SOURCE_LABELS[p.source]}</TableTd>
                    </TableTr>
                  ))}
                </TableTbody>
              </Table>
            </TableScrollContainer>
          )}
          {access.denied.length ? (
            <Stack gap={4}>
              <Text fw={600} size="sm">
                Denied for this user
              </Text>
              <Group gap={4}>
                {access.denied.map((key) => (
                  <Badge key={key} color="red" variant="light">
                    {label(key)}
                  </Badge>
                ))}
              </Group>
            </Stack>
          ) : null}
        </Stack>
      </Paper>

      <Paper withBorder p="lg">
        <Stack>
          <div>
            <Title order={4}>Fields</Title>
            <Text size="sm" c="dimmed">
              Field access is the union of all roles: if any role can see a
              field, this user can.
            </Text>
          </div>
          {Object.entries(access.fields).map(([entityKey, sets]) => (
            <Stack key={entityKey} gap="xs">
              <Text fw={600}>
                {entities.get(entityKey)?.label ?? entityKey}
              </Text>
              <Text size="sm">Can see</Text>
              <FieldList
                names={sets.read.map((n) => fieldLabel(entityKey, n))}
              />
              <Text size="sm">Can change</Text>
              <FieldList
                names={sets.write.map((n) => fieldLabel(entityKey, n))}
              />
            </Stack>
          ))}
        </Stack>
      </Paper>
    </Stack>
  );
}
