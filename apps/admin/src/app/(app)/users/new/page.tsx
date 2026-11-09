import { canDo, PageHead } from '@dax/web-shell';
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
    <>
      <PageHead
        eyebrow="Admin · People"
        title="Add user"
        lede="They get an email with a link to set their password."
        back={{ href: '/users', label: 'Users' }}
      />
      <div style={{ maxWidth: 640 }}>
        <NewUserForm
          roles={roles
            .filter(
              (r) => !r.archived && (caps.isSuperAdmin || !r.isSuperAdmin),
            )
            .map((r) => ({ value: r.id, label: r.name }))}
          departments={departments
            .filter((d) => d.active)
            .map((d) => ({ value: d.id, label: d.name }))}
        />
      </div>
    </>
  );
}
