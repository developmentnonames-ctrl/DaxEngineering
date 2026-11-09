import { canDo, PageHead } from '@dax/web-shell';
import { getDepartments } from '../../../lib/data';
import { requirePermission } from '../../../lib/server';
import { AddDepartmentForm, DepartmentsTable } from './departments-table';

export default async function DepartmentsPage() {
  const caps = await requirePermission('core.departments.view');
  const departments = await getDepartments();
  const canManage = canDo(caps, 'core.departments.manage');
  return (
    <>
      <PageHead
        eyebrow="Admin · People"
        title="Departments"
        lede="Departments limit what people with Department scope can see and do. Turn a department off instead of deleting it; its history stays."
      />
      {canManage ? <AddDepartmentForm /> : null}
      <DepartmentsTable departments={departments} canManage={canManage} />
    </>
  );
}
