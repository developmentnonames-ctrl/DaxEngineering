import { PageHead, SectionCard } from '@dax/web-shell';
import { requirePermission } from '../../../../lib/server';
import { createRole } from '../actions';
import { RoleForm } from '../role-form';

export default async function NewRolePage() {
  await requirePermission('core.roles.manage');
  return (
    <>
      <PageHead
        eyebrow="Admin · Access"
        title="Add role"
        lede="You can set permissions and field access after the role is added."
        back={{ href: '/roles', label: 'Roles' }}
      />
      <div style={{ maxWidth: 640 }}>
        <SectionCard title="Settings">
          <RoleForm action={createRole} submitLabel="Add role" />
        </SectionCard>
      </div>
    </>
  );
}
