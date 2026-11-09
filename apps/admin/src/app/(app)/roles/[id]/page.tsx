import { Alert, Divider, Stack } from '@mantine/core';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { RoleDetail } from '@dax/platform-contract';
import { ApiError } from '@dax/web-data-access/server';
import { canDo, PageHead, Pill, SectionCard } from '@dax/web-shell';
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
    <>
      <PageHead
        eyebrow="Admin · Access"
        back={{ href: '/roles', label: 'Roles' }}
        title={role.name}
        lede={
          <span className="dax-chips" style={{ alignItems: 'center' }}>
            {role.isSuperAdmin ? <Pill tone="bad">Super admin</Pill> : null}
            {role.isSystem ? <Pill>System</Pill> : null}
            {role.archived ? <Pill>Archived</Pill> : null}
            <span>
              {role.userCount === 1
                ? '1 user has this role.'
                : `${role.userCount} users have this role.`}
            </span>
          </span>
        }
      />
      {!canManage ? (
        <Alert color="gray">You can view this role but not change it.</Alert>
      ) : role.archived ? (
        <Alert color="gray">
          This role is archived. Restore it to make changes.
        </Alert>
      ) : null}

      <div style={{ maxWidth: 680 }}>
        <SectionCard title="Settings">
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
        </SectionCard>
      </div>

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
        <div style={{ maxWidth: 680 }}>
          <SectionCard title="Copy or archive">
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
          </SectionCard>
        </div>
      ) : null}
    </>
  );
}
