import { Text, Title } from '@mantine/core';
import { canDo } from '@dax/web-shell';
import { getDepartments } from '../../../lib/data';
import { requirePermission } from '../../../lib/server';
import { AddDepartmentForm, DepartmentsTable } from './departments-table';

export default async function DepartmentsPage() {
  const caps = await requirePermission('core.departments.view');
  const departments = await getDepartments();
  const canManage = canDo(caps, 'core.departments.manage');
  return (
    <>
      <Title order={2}>Departments</Title>
      <Text size="sm" c="dimmed">
        Departments limit what people with Department scope can see and do. Turn
        a department off instead of deleting it; its history stays.
      </Text>
      {canManage ? <AddDepartmentForm /> : null}
      <DepartmentsTable departments={departments} canManage={canManage} />
    </>
  );
}
