import {
  Button,
  Table,
  TableScrollContainer,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
  Text,
} from '@mantine/core';
import Link from 'next/link';
import {
  canDo,
  Chips,
  Empty,
  Icon,
  PageHead,
  Pill,
  SectionCard,
} from '@dax/web-shell';
import { getRoles } from '../../../lib/data';
import { requirePermission } from '../../../lib/server';

export default async function RolesPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const caps = await requirePermission('core.roles.view');
  const [roles, { archived }] = await Promise.all([getRoles(), searchParams]);
  const showArchived = archived === '1';
  const shown = roles.filter((r) => r.archived === showArchived);
  const canManage = canDo(caps, 'core.roles.manage');

  return (
    <>
      <PageHead
        eyebrow="Admin · Access"
        title="Roles"
        lede="A role is a set of permissions and field access. People get everything their roles allow."
        actions={
          canManage ? (
            <Button
              component="a"
              href="/roles/new"
              leftSection={<Icon name="plus" size={18} />}
            >
              Add role
            </Button>
          ) : null
        }
      />
      <SectionCard
        flush
        title={showArchived ? 'Archived roles' : 'Active roles'}
        note={`${shown.length} ${shown.length === 1 ? 'role' : 'roles'}`}
        toolbar={
          <Chips
            items={[
              { href: '/roles', label: 'Active', active: !showArchived },
              {
                href: '/roles?archived=1',
                label: 'Archived',
                active: showArchived,
              },
            ]}
          />
        }
      >
        {shown.length === 0 ? (
          <div className="dax-card-body">
            <Empty
              title={showArchived ? 'No archived roles' : 'No roles yet'}
            />
          </div>
        ) : (
          <TableScrollContainer minWidth={640}>
            <Table>
              <TableThead>
                <TableTr>
                  <TableTh>Role</TableTh>
                  <TableTh>Description</TableTh>
                  <TableTh />
                  <TableTh ta="right">Users</TableTh>
                </TableTr>
              </TableThead>
              <TableTbody>
                {shown.map((role) => (
                  <TableTr key={role.id}>
                    <TableTd>
                      <Link href={`/roles/${role.id}`} className="dax-link">
                        {role.name}
                      </Link>
                    </TableTd>
                    <TableTd>
                      <Text size="sm" c="dimmed" lineClamp={2}>
                        {role.description ?? '—'}
                      </Text>
                    </TableTd>
                    <TableTd>
                      <div className="dax-chips" style={{ gap: 4 }}>
                        {role.isSuperAdmin ? (
                          <Pill tone="bad">Super admin</Pill>
                        ) : null}
                        {role.isSystem ? <Pill>System</Pill> : null}
                        {role.require2fa ? (
                          <Pill tone="int">Two-step required</Pill>
                        ) : null}
                        {role.archived ? <Pill>Archived</Pill> : null}
                      </div>
                    </TableTd>
                    <TableTd ta="right" className="dax-num">
                      {role.userCount}
                    </TableTd>
                  </TableTr>
                ))}
              </TableTbody>
            </Table>
          </TableScrollContainer>
        )}
      </SectionCard>
    </>
  );
}
