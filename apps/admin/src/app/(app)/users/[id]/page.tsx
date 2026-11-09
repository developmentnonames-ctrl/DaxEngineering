import { Alert } from '@mantine/core';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import {
  type AdminCatalog,
  AdminUserDetail,
  EffectiveAccess,
} from '@dax/platform-contract';
import { ApiError } from '@dax/web-data-access/server';
import {
  canDo,
  canWriteField,
  Empty,
  Mono,
  PageHead,
  Pill,
} from '@dax/web-shell';
import { permissionIndex } from '../../../../lib/catalog';
import { getCatalog, getDepartments, getRoles } from '../../../../lib/data';
import { STATUS_TONES, userStatus } from '../../../../lib/format';
import { api, requirePermission } from '../../../../lib/server';
import { isoToDay } from '../dates';
import { unlessForbidden } from '../../../../lib/load';
import { AccessForm } from './access-form';
import { AccountActions } from './account-actions';
import { EffectiveAccessView } from './effective-access';
import { OverridesPanel } from './overrides-panel';
import { ProfileForm } from './profile-form';
import { USER_TABS, type UserTab } from './tabs';
import { UserTabs } from './user-tabs';

const EMPTY_CATALOG: AdminCatalog = { modules: [], entities: [] };

async function loadUser(id: string) {
  try {
    return await api.request(`/admin/users/${id}`, (d) =>
      AdminUserDetail.parse(d),
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
}

export default async function UserPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string; tab?: string }>;
}) {
  const caps = await requirePermission('core.users.view');
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!z.uuid().safeParse(id).success) notFound();

  const canAssign = canDo(caps, 'core.users.assign_roles');
  const canOverride = canDo(caps, 'core.users.override');
  const [user, catalog, roles, departments, effective] = await Promise.all([
    loadUser(id),
    unlessForbidden(getCatalog(), EMPTY_CATALOG),
    canAssign ? unlessForbidden(getRoles(), []) : Promise.resolve([]),
    canAssign ? unlessForbidden(getDepartments(), []) : Promise.resolve([]),
    unlessForbidden(
      api.request(`/admin/users/${id}/effective-access`, (d) =>
        EffectiveAccess.parse(d),
      ),
      null,
    ),
  ]);

  const status = userStatus(user);
  const permissions = permissionIndex(catalog);
  const canEdit = canDo(caps, 'core.users.edit');
  const tab: UserTab = USER_TABS.find((t) => t === query.tab) ?? 'profile';

  const roleOptions = roles.length
    ? roles
        .filter((r) => !r.archived || user.roles.some((ur) => ur.id === r.id))
        .map((r) => ({
          id: r.id,
          name: r.name,
          description: r.description,
          locked: !caps.isSuperAdmin && r.isSuperAdmin,
        }))
    : user.roles.map((r) => ({
        id: r.id,
        name: r.name,
        description: null,
        locked: true,
      }));
  const departmentOptions = departments.length
    ? departments
        .filter(
          (d) => d.active || user.departments.some((ud) => ud.id === d.id),
        )
        .map((d) => ({ id: d.id, name: d.name }))
    : user.departments;

  return (
    <>
      <PageHead
        eyebrow="Admin · People"
        back={{ href: '/users', label: 'Users' }}
        title={user.name}
        lede={
          <span className="dax-chips" style={{ alignItems: 'center' }}>
            <Pill tone={STATUS_TONES[status]}>{status}</Pill>
            {user.isSuperAdmin ? <Pill tone="bad">Super admin</Pill> : null}
            {user.username ? <Mono>@{user.username}</Mono> : null}
            <span>Two-step sign-in {user.twoFactorEnabled ? 'on' : 'off'}</span>
          </span>
        }
        actions={
          canDo(caps, 'core.users.lock') ? (
            <AccountActions
              userId={user.id}
              status={status}
              hasPassword={user.hasPassword}
              isSelf={caps.user.id === user.id}
            />
          ) : null
        }
      />
      {query.created ? (
        <Alert color="green">
          User added. They will get an email to set their password.
        </Alert>
      ) : null}
      <UserTabs
        initial={tab}
        profile={
          <ProfileForm
            user={{
              id: user.id,
              name: user.name,
              username: user.username ?? null,
              email: user.email,
            }}
            editable={{
              name: canEdit && canWriteField(caps, 'core.user', 'name'),
              username: canEdit && canWriteField(caps, 'core.user', 'username'),
              email: canEdit && canWriteField(caps, 'core.user', 'email'),
            }}
          />
        }
        access={
          <AccessForm
            userId={user.id}
            canEdit={canAssign}
            roles={roleOptions}
            departments={departmentOptions}
            current={{
              roles: user.roles.map((r) => ({
                roleId: r.id,
                expiresOn: isoToDay(r.expiresAt) || null,
              })),
              departmentIds: user.departments.map((d) => d.id),
            }}
          />
        }
        overrides={
          <OverridesPanel
            userId={user.id}
            canEdit={canOverride}
            overrides={user.overrides.map((o) => ({
              ...o,
              label: permissions.get(o.permissionKey)?.label ?? o.permissionKey,
            }))}
            permissions={catalog.modules.map((m) => ({
              group: m.name,
              items: m.features.flatMap((f) =>
                f.actions.map((a) => ({
                  value: a.permissionKey,
                  label: `${f.name} · ${a.label}`,
                  scopes: a.scopes,
                })),
              ),
            }))}
          />
        }
        effective={
          effective ? (
            <EffectiveAccessView
              access={effective}
              catalog={catalog}
              permissions={permissions}
            />
          ) : (
            <Empty title="Effective access is hidden">
              You can&apos;t see this user&apos;s effective access.
            </Empty>
          )
        }
      />
    </>
  );
}
