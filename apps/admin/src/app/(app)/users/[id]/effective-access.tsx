import {
  Alert,
  Stack,
  Table,
  TableScrollContainer,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
} from '@mantine/core';
import type { AdminCatalog, EffectiveAccess } from '@dax/platform-contract';
import { Empty, Pill, SectionCard } from '@dax/web-shell';
import type { PermissionInfo } from '../../../../lib/catalog';
import { SCOPE_LABELS } from '../../../../lib/format';

const SOURCE_LABELS: Record<
  EffectiveAccess['permissions'][number]['source'],
  string
> = {
  role: 'Role',
  override: 'Single grant',
  super_admin: 'Super admin',
};

function FieldList({ names }: { names: string[] }) {
  if (names.length === 0) return <span className="dax-muted">None</span>;
  return (
    <div className="dax-chips" style={{ gap: 4 }}>
      {names.map((n) => (
        <Pill key={n}>{n}</Pill>
      ))}
    </div>
  );
}

export function EffectiveAccessView({
  access,
  catalog,
  permissions,
}: {
  access: EffectiveAccess;
  catalog: AdminCatalog;
  permissions: Map<string, PermissionInfo>;
}) {
  const label = (key: string) => permissions.get(key)?.label ?? key;
  const entities = new Map(catalog.entities.map((e) => [e.key, e]));
  const fieldLabel = (entityKey: string, name: string) =>
    entities.get(entityKey)?.fields.find((f) => f.name === name)?.label ?? name;
  const sorted = [...access.permissions].sort((a, b) =>
    label(a.key).localeCompare(label(b.key)),
  );

  return (
    <Stack maw={960} gap="lg">
      {access.isSuperAdmin ? (
        <Alert color="red">Super admins have every permission.</Alert>
      ) : null}

      <SectionCard
        flush
        title="Permissions"
        note={
          <>
            Two-step sign-in is{' '}
            <strong>{access.require2fa ? 'required' : 'not required'}</strong>{' '}
            by this user&apos;s roles.
          </>
        }
      >
        {sorted.length === 0 ? (
          <div className="dax-card-body">
            <Empty title="No permissions" />
          </div>
        ) : (
          <TableScrollContainer minWidth={560}>
            <Table>
              <TableThead>
                <TableTr>
                  <TableTh>Permission</TableTh>
                  <TableTh>Scope</TableTh>
                  <TableTh>From</TableTh>
                </TableTr>
              </TableThead>
              <TableTbody>
                {sorted.map((p) => (
                  <TableTr key={p.key}>
                    <TableTd>{label(p.key)}</TableTd>
                    <TableTd>{SCOPE_LABELS[p.scope]}</TableTd>
                    <TableTd>
                      <Pill
                        tone={
                          p.source === 'override'
                            ? 'hi'
                            : p.source === 'super_admin'
                              ? 'bad'
                              : 'int'
                        }
                      >
                        {SOURCE_LABELS[p.source]}
                      </Pill>
                    </TableTd>
                  </TableTr>
                ))}
              </TableTbody>
            </Table>
          </TableScrollContainer>
        )}
        {access.denied.length ? (
          <div className="dax-card-body" style={{ paddingTop: 16 }}>
            <div className="dax-eyebrow" style={{ marginBottom: 6 }}>
              Denied for this user
            </div>
            <div className="dax-chips" style={{ gap: 4 }}>
              {access.denied.map((key) => (
                <Pill key={key} tone="bad">
                  {label(key)}
                </Pill>
              ))}
            </div>
          </div>
        ) : null}
      </SectionCard>

      <SectionCard
        title="Fields"
        note="Field access is the union of all roles: if any role can see a field, this user can."
      >
        <Stack gap="md">
          {Object.entries(access.fields).map(([entityKey, sets]) => (
            <div key={entityKey} className="dax-inset">
              <b>{entities.get(entityKey)?.label ?? entityKey}</b>
              <div className="dax-eyebrow" style={{ margin: '8px 0 4px' }}>
                Can see
              </div>
              <FieldList
                names={sets.read.map((n) => fieldLabel(entityKey, n))}
              />
              <div className="dax-eyebrow" style={{ margin: '10px 0 4px' }}>
                Can change
              </div>
              <FieldList
                names={sets.write.map((n) => fieldLabel(entityKey, n))}
              />
            </div>
          ))}
        </Stack>
      </SectionCard>
    </Stack>
  );
}
