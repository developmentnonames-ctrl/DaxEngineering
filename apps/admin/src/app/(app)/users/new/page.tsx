import { Anchor, Stack, Title } from '@mantine/core';
import { canDo } from '@dax/web-shell';
import { getDepartments, getRoles } from '../../../../lib/data';
import { requirePermission } from '../../../../lib/server';
import { unlessForbidden } from '../../../../lib/load';
import { NewUserForm } from './new-user-form';

export default async function NewUserPage() {
  const caps = await requirePermission('core.users.create');
  const canAssign = canDo(caps, 'core.users.assign_roles');
  const [roles, departments] = await Promise.all([
    canAssign ? unlessForbidden(getRoles(), []) : Promise.resolve([]),
    unlessForbidden(getDepartments(), []),
  ]);
  return (
    <Stack maw={560}>
      <Anchor href="/users" size="sm">
        Back to users
      </Anchor>
      <Title order={2}>Add user</Title>
      <NewUserForm
        roles={roles
          .filter((r) => !r.archived && (caps.isSuperAdmin || !r.isSuperAdmin))
          .map((r) => ({ value: r.id, label: r.name }))}
        departments={departments
          .filter((d) => d.active)
          .map((d) => ({ value: d.id, label: d.name }))}
      />
    </Stack>
  );
}
