import {
  Anchor,
  Badge,
  Button,
  Group,
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
import { canDo } from '@dax/web-shell';
import { getRoles } from '../../../lib/data';
import { requirePermission } from '../../../lib/server';

export default async function RolesPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const caps = await requirePermission('core.roles.view');
  const [roles, { archived }] = await Promise.all([getRoles(), searchParams]);
  const showArchived = archived === '1';
  const shown = roles.filter((r) => r.archived === showArchived);
  const canManage = canDo(caps, 'core.roles.manage');

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>Roles</Title>
        {canManage ? (
          <Button component="a" href="/roles/new">
            Add role
          </Button>
        ) : null}
      </Group>
      <Group gap="xs">
        <Button
          component="a"
          href="/roles"
          size="xs"
          variant={showArchived ? 'default' : 'filled'}
        >
          Active
        </Button>
        <Button
          component="a"
          href="/roles?archived=1"
          size="xs"
          variant={showArchived ? 'filled' : 'default'}
        >
          Archived
        </Button>
      </Group>
      {shown.length === 0 ? (
        <Text c="dimmed">
          {showArchived ? 'No archived roles.' : 'No roles yet.'}
        </Text>
      ) : (
        <TableScrollContainer minWidth={640}>
          <Table striped withTableBorder>
            <TableThead>
              <TableTr>
                <TableTh>Role</TableTh>
                <TableTh>Description</TableTh>
                <TableTh />
                <TableTh ta="right">Users</TableTh>
              </TableTr>
            </TableThead>
            <TableTbody>
              {shown.map((role) => (
                <TableTr key={role.id}>
                  <TableTd>
                    <Anchor href={`/roles/${role.id}`} fw={500}>
                      {role.name}
                    </Anchor>
                  </TableTd>
                  <TableTd>
                    <Text size="sm" c="dimmed" lineClamp={2}>
                      {role.description ?? '—'}
                    </Text>
                  </TableTd>
                  <TableTd>
                    <Group gap={4}>
                      {role.isSuperAdmin ? (
                        <Badge color="red" variant="light">
                          Super admin
                        </Badge>
                      ) : null}
                      {role.isSystem ? (
                        <Badge color="gray" variant="light">
                          System
                        </Badge>
                      ) : null}
                      {role.require2fa ? (
                        <Badge color="blue" variant="light">
                          Two-step required
                        </Badge>
                      ) : null}
                      {role.archived ? (
                        <Badge color="gray">Archived</Badge>
                      ) : null}
                    </Group>
                  </TableTd>
                  <TableTd ta="right">{role.userCount}</TableTd>
                </TableTr>
              ))}
            </TableTbody>
          </Table>
        </TableScrollContainer>
      )}
    </Stack>
  );
}
