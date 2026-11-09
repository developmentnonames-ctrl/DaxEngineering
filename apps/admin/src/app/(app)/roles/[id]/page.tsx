import {
  Alert,
  Anchor,
  Badge,
  Divider,
  Group,
  Paper,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { RoleDetail } from '@dax/platform-contract';
import { ApiError } from '@dax/web-data-access/server';
import { canDo } from '@dax/web-shell';
import { getCatalog } from '../../../../lib/data';
import { api, requirePermission } from '../../../../lib/server';
import { copyRole, saveGrants, setRoleArchived, updateRole } from '../actions';
import { RoleForm } from '../role-form';
import { GrantsEditor } from './grants-editor';
import { ArchiveRoleForm, CopyRoleForm } from './role-actions';

async function loadRole(id: string) {
  if (!z.uuid().safeParse(id).success) notFound();
  try {
    return await api.request(`/admin/roles/${id}`, (d) => RoleDetail.parse(d));
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
}

export default async function RolePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const caps = await requirePermission('core.roles.view');
  const { id } = await params;
  const [role, catalog] = await Promise.all([loadRole(id), getCatalog()]);
  const canManage = canDo(caps, 'core.roles.manage');
  const readOnly = !canManage || role.archived;

  return (
    <Stack gap="lg">
      <Anchor href="/roles" size="sm">
        Back to roles
      </Anchor>
      <Group gap="xs">
        <Title order={2}>{role.name}</Title>
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
        {role.archived ? <Badge color="gray">Archived</Badge> : null}
      </Group>
      <Text size="sm" c="dimmed">
        {role.userCount === 1
          ? '1 user has this role.'
          : `${role.userCount} users have this role.`}
      </Text>
      {!canManage ? (
        <Alert color="gray">You can view this role but not change it.</Alert>
      ) : role.archived ? (
        <Alert color="gray">
          This role is archived. Restore it to make changes.
        </Alert>
      ) : null}

      <Paper withBorder p="lg" maw={640}>
        <Stack>
          <Title order={3}>Settings</Title>
          <RoleForm
            action={updateRole.bind(null, role.id)}
            defaults={{
              name: role.name,
              description: role.description,
              require2fa: role.require2fa,
            }}
            submitLabel="Save settings"
            readOnly={readOnly}
          />
        </Stack>
      </Paper>

      {role.isSuperAdmin ? (
        <Alert color="blue" title="Super admins have every permission">
          This role sees and can do everything, including every field. Only
          super admins can give this role to someone.
        </Alert>
      ) : (
        <GrantsEditor
          role={role}
          modules={catalog.modules}
          entities={catalog.entities}
          readOnly={readOnly}
          save={saveGrants.bind(null, role.id)}
        />
      )}

      {canManage && !role.isSuperAdmin ? (
        <Paper withBorder p="lg" maw={640}>
          <Stack gap="lg">
            {role.archived ? null : (
              <CopyRoleForm
                roleName={role.name}
                action={copyRole.bind(null, role.id)}
              />
            )}
            {role.isSystem ? null : (
              <>
                {role.archived ? null : <Divider />}
                <ArchiveRoleForm
                  archived={role.archived}
                  action={setRoleArchived.bind(null, role.id, !role.archived)}
                />
              </>
            )}
          </Stack>
        </Paper>
      ) : null}
    </Stack>
  );
}
