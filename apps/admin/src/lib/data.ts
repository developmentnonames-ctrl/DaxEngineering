import 'server-only';
import { cache } from 'react';
import { AdminCatalog, DepartmentList, RoleList } from '@dax/platform-contract';
import { api } from './server';

export const getCatalog = cache(() =>
  api.request('/admin/catalog', (d) => AdminCatalog.parse(d)),
);

export const getRoles = cache(async () => {
  const { roles } = await api.request('/admin/roles', (d) => RoleList.parse(d));
  return roles;
});

export const getDepartments = cache(async () => {
  const { departments } = await api.request('/admin/departments', (d) =>
    DepartmentList.parse(d),
  );
  return departments;
});
