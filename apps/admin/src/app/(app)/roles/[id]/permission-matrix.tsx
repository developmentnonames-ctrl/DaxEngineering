'use client';

import {
  Button,
  Checkbox,
  Select,
  Stack,
  Table,
  Text,
  Tooltip,
} from '@mantine/core';
import { Pill, SectionCard } from '@dax/web-shell';
import type { Dispatch, SetStateAction } from 'react';
import type { CatalogAction, CatalogModule } from '../../../../lib/catalog';
import { SCOPE_LABELS } from '../../../../lib/format';
import {
  allowedScopes,
  type GrantScope,
  humanize,
  type PermissionState,
  widestScope,
} from '../grants';

type CellValue = GrantScope | 'NONE';

function actionColumns(module: CatalogModule): string[] {
  const seen = new Set<string>();
  for (const feature of module.features) {
    for (const action of feature.actions) seen.add(action.action);
  }
  return [...seen];
}

function ScopeCell({
  action,
  featureName,
  value,
  readOnly,
  onChange,
}: {
  action: CatalogAction;
  featureName: string;
  value: GrantScope | undefined;
  readOnly: boolean;
  onChange: (scope: GrantScope | null) => void;
}) {
  const scopes = allowedScopes(action);
  const label = `${featureName}: ${action.label}`;
  const hint = action.isApproval ? `${action.label} (approval)` : action.label;
  const control =
    scopes.length === 1 ? (
      <Checkbox
        aria-label={label}
        checked={value !== undefined}
        disabled={readOnly}
        onChange={(e) =>
          onChange(e.currentTarget.checked ? widestScope(action) : null)
        }
      />
    ) : (
      <Select<CellValue>
        aria-label={label}
        size="xs"
        w={130}
        allowDeselect={false}
        disabled={readOnly}
        value={value ?? 'NONE'}
        data={[
          { value: 'NONE', label: 'None' },
          ...scopes.map((s) => ({ value: s, label: SCOPE_LABELS[s] })),
        ]}
        onChange={(next) => onChange(!next || next === 'NONE' ? null : next)}
      />
    );
  return (
    <Tooltip
      label={action.description ?? hint}
      multiline
      maw={280}
      openDelay={300}
    >
      <span style={{ display: 'inline-block' }}>{control}</span>
    </Tooltip>
  );
}

export function PermissionMatrix({
  modules,
  permissions,
  setPermissions,
  readOnly,
}: {
  modules: readonly CatalogModule[];
  permissions: PermissionState;
  setPermissions: Dispatch<SetStateAction<PermissionState>>;
  readOnly: boolean;
}) {
  const setOne = (key: string, scope: GrantScope | null) =>
    setPermissions((prev) => {
      const next = { ...prev };
      if (scope) next[key] = scope;
      else delete next[key];
      return next;
    });

  const grantAllView = () =>
    setPermissions((prev) => {
      const next = { ...prev };
      for (const m of modules) {
        for (const f of m.features) {
          for (const a of f.actions) {
            if (a.action === 'view' && !next[a.permissionKey]) {
              next[a.permissionKey] = widestScope(a);
            }
          }
        }
      }
      return next;
    });

  return (
    <Stack gap="lg">
      <SectionCard
        title="Permissions"
        note="Scope sets which records a permission covers: Own (records they created), Department (records of their departments) or All."
        actions={
          readOnly ? null : (
            <>
              <Button size="xs" variant="light" onClick={grantAllView}>
                Grant all view actions
              </Button>
              <Button
                size="xs"
                variant="default"
                onClick={() => setPermissions({})}
              >
                Clear all
              </Button>
            </>
          )
        }
      />
      {modules.map((module) => {
        const columns = actionColumns(module);
        return (
          <SectionCard
            key={module.key}
            flush
            title={module.name}
            note={
              module.enabled
                ? undefined
                : 'This module is off. Its permissions take effect when it is turned on.'
            }
            actions={module.enabled ? undefined : <Pill>Off</Pill>}
          >
            <Table.ScrollContainer minWidth={180 + columns.length * 150}>
              <Table verticalSpacing="xs">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Feature</Table.Th>
                    {columns.map((c) => (
                      <Table.Th key={c}>{humanize(c)}</Table.Th>
                    ))}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {module.features.map((feature) => (
                    <Table.Tr key={feature.key}>
                      <Table.Td fw={500}>{feature.name}</Table.Td>
                      {columns.map((c) => {
                        const action = feature.actions.find(
                          (a) => a.action === c,
                        );
                        return (
                          <Table.Td key={c}>
                            {action ? (
                              <ScopeCell
                                action={action}
                                featureName={feature.name}
                                value={permissions[action.permissionKey]}
                                readOnly={readOnly}
                                onChange={(scope) =>
                                  setOne(action.permissionKey, scope)
                                }
                              />
                            ) : (
                              <Text c="dimmed" size="sm">
                                —
                              </Text>
                            )}
                          </Table.Td>
                        );
                      })}
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </SectionCard>
        );
      })}
    </Stack>
  );
}
