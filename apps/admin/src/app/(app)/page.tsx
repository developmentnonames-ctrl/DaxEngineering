import Link from 'next/link';
import { AdminSummary, AdminUserList, AuditPage } from '@dax/platform-contract';
import {
  ActionTiles,
  type ActionTileItem,
  canDo,
  Empty,
  greeting,
  KpiTiles,
  LinkList,
  PageHead,
  Pill,
  SectionCard,
  todayLabel,
} from '@dax/web-shell';
import {
  formatDateTime,
  humanizeAction,
  STATUS_TONES,
  userStatus,
} from '../../lib/format';
import { getCatalog } from '../../lib/data';
import { unlessForbidden } from '../../lib/load';
import { api, requireCapabilities } from '../../lib/server';

const count = new Intl.NumberFormat('en-LK');

export default async function AdminHome() {
  const caps = await requireCapabilities();
  const can = (p: string) => canDo(caps, p);
  const canUsers = can('core.users.view');
  const canAudit = can('core.audit.view');

  const [summary, users, audit, catalog] = await Promise.all([
    unlessForbidden(
      api.request('/admin/summary', (d) => AdminSummary.parse(d)),
      null,
    ),
    canUsers
      ? unlessForbidden(
          api.request('/admin/users', (d) => AdminUserList.parse(d)),
          null,
        )
      : null,
    canAudit
      ? unlessForbidden(
          api.request('/admin/audit?limit=6', (d) => AuditPage.parse(d)),
          null,
        )
      : null,
    canAudit ? unlessForbidden(getCatalog(), null) : null,
  ]);
  const entityLabel = (key: string) =>
    catalog?.entities.find((e) => e.key === key)?.label ?? key;
  const firstName = caps.user.name.trim().split(/\s+/)[0] ?? caps.user.name;

  const tiles: ActionTileItem[] = [];
  if (can('core.users.create'))
    tiles.push({
      href: '/users/new',
      title: 'Add a user',
      sub: 'They get an email to set their password.',
      icon: 'user-plus',
      use: 'sometimes',
    });
  if (canUsers)
    tiles.push({
      href: '/users',
      title: 'Manage users',
      sub: summary?.locked
        ? `${count.format(summary.locked)} locked out. Roles, departments and sign-in.`
        : 'Roles, departments, locks and two-step sign-in.',
      icon: 'users',
      use: 'often',
    });
  if (can('core.roles.view'))
    tiles.push({
      href: '/roles',
      title: 'Set role access',
      sub: 'What each role can see and change.',
      icon: 'key',
      use: 'rarely',
    });
  if (canAudit)
    tiles.push({
      href: '/audit',
      title: 'Review changes',
      sub: 'Who changed what, and when.',
      icon: 'history',
      use: 'often',
    });
  if (can('core.modules.view'))
    tiles.push({
      href: '/modules',
      title: 'Switch modules',
      sub: 'Turn parts of the system on or off.',
      icon: 'puzzle',
      use: 'rarely',
    });
  if (can('core.numbering.view'))
    tiles.push({
      href: '/numbering',
      title: 'Set numbering',
      sub: 'Prefixes and next numbers for records.',
      icon: 'hash',
      use: 'rarely',
    });
  if (can('core.departments.view'))
    tiles.push({
      href: '/departments',
      title: 'Edit departments',
      sub: 'Groups that limit what people see.',
      icon: 'hierarchy',
      use: 'rarely',
    });

  const attention = (users?.users ?? [])
    .map((u) => ({ user: u, status: userStatus(u) }))
    .filter((u) => u.status === 'Locked' || u.status === 'Invited')
    .slice(0, 6);

  return (
    <>
      <PageHead
        eyebrow={todayLabel()}
        title={`${greeting()}, ${firstName}`}
        lede="Manage who can sign in, what they can do and how records are numbered."
      />
      {summary ? (
        <KpiTiles
          items={[
            {
              label: 'Users',
              value: count.format(summary.users),
              tone: 'int',
              href: canUsers ? '/users' : undefined,
            },
            {
              label: 'Locked',
              value: count.format(summary.locked),
              tone: 'bad',
              href: canUsers ? '/users' : undefined,
            },
            {
              label: 'Awaiting password',
              value: count.format(summary.invited),
              tone: 'hi',
              href: canUsers ? '/users' : undefined,
            },
            {
              label: 'Roles',
              value: count.format(summary.roles),
              tone: 'ext',
              href: can('core.roles.view') ? '/roles' : undefined,
            },
            {
              label: 'Audit entries in 24h',
              value: count.format(summary.auditToday),
              tone: 'ok',
              href: canAudit ? '/audit' : undefined,
            },
          ]}
        />
      ) : null}
      {tiles.length ? (
        <SectionCard title="What would you like to do?">
          <ActionTiles items={tiles} />
        </SectionCard>
      ) : (
        <Empty title="No admin screens yet">
          Ask a super admin to give one of your roles access.
        </Empty>
      )}
      {users || audit ? (
        <div className="dax-grid2">
          {users ? (
            <SectionCard
              title="Needs attention"
              note="Locked accounts and people who have not set a password"
            >
              {attention.length ? (
                <LinkList
                  items={attention.map(({ user, status }) => ({
                    key: user.id,
                    href: `/users/${user.id}`,
                    title: user.name,
                    sub: user.username ?? user.email ?? undefined,
                    aside: <Pill tone={STATUS_TONES[status]}>{status}</Pill>,
                  }))}
                />
              ) : (
                <Empty title="Everyone can sign in" />
              )}
            </SectionCard>
          ) : null}
          {audit ? (
            <SectionCard
              title="Recent changes"
              note="Latest audit entries"
              actions={
                <Link className="dax-link" href="/audit">
                  See all
                </Link>
              }
            >
              {audit.entries.length ? (
                <LinkList
                  items={audit.entries.map((e) => ({
                    key: e.id,
                    title: `${humanizeAction(e.action)} · ${entityLabel(e.entityKey)}`,
                    sub: `${e.actorName ?? 'System'} · ${formatDateTime(e.occurredAt)}`,
                  }))}
                />
              ) : (
                <Empty title="No changes yet" />
              )}
            </SectionCard>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
