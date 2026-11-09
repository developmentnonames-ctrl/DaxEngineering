'use client';

import { Alert, Badge, Button, Group, Paper, Stack, Text } from '@mantine/core';
import type { RoleDetail } from '@dax/platform-contract';
import { startTransition, useActionState, useMemo, useState } from 'react';
import type { CatalogEntity, CatalogModule } from '../../../../lib/catalog';
import type { GrantsState } from '../actions';
import {
  type FieldState,
  fieldDeviations,
  fieldState,
  grantsSnapshot,
  type PermissionState,
  permissionList,
  permissionState,
} from '../grants';
import { FieldGrid } from './field-grid';
import { PermissionMatrix } from './permission-matrix';

export function GrantsEditor({
  role,
  modules,
  entities,
  readOnly,
  save,
}: {
  role: RoleDetail;
  modules: readonly CatalogModule[];
  entities: readonly CatalogEntity[];
  readOnly: boolean;
  save: (prev: GrantsState, payload: unknown) => Promise<GrantsState>;
}) {
  const [permissions, setPermissions] = useState<PermissionState>(() =>
    permissionState(role.permissions),
  );
  const [fields, setFields] = useState<FieldState>(() =>
    fieldState(entities, role.fieldGrants),
  );
  const [state, dispatch, pending] = useActionState(save, { ok: false });

  const saved = useMemo(
    () =>
      grantsSnapshot(
        permissionList(permissionState(role.permissions)),
        fieldDeviations(entities, fieldState(entities, role.fieldGrants)),
      ),
    [role, entities],
  );
  const payload = {
    version: role.version,
    permissions: permissionList(permissions),
    fieldGrants: fieldDeviations(entities, fields),
  };
  const dirty =
    grantsSnapshot(payload.permissions, payload.fieldGrants) !== saved;

  const discard = () => {
    setPermissions(permissionState(role.permissions));
    setFields(fieldState(entities, role.fieldGrants));
  };

  return (
    <Stack gap="xl">
      <PermissionMatrix
        modules={modules}
        permissions={permissions}
        setPermissions={setPermissions}
        readOnly={readOnly}
      />
      <FieldGrid
        entities={entities}
        fields={fields}
        setFields={setFields}
        readOnly={readOnly}
      />
      {readOnly ? null : (
        <Paper
          withBorder
          shadow="sm"
          p="md"
          pos="sticky"
          bottom={0}
          style={{ zIndex: 2 }}
        >
          <Stack gap="xs">
            {state.error ? (
              <Alert color="red">
                <Group justify="space-between">
                  <Text size="sm">{state.error}</Text>
                  {state.stale ? (
                    <Button
                      size="xs"
                      variant="white"
                      color="red"
                      onClick={() => window.location.reload()}
                    >
                      Reload
                    </Button>
                  ) : null}
                </Group>
              </Alert>
            ) : null}
            <Group justify="space-between">
              {dirty ? (
                <Badge color="yellow" variant="light">
                  Unsaved changes
                </Badge>
              ) : state.ok && state.message ? (
                <Text size="sm" c="green">
                  {state.message}
                </Text>
              ) : (
                <Text size="sm" c="dimmed">
                  No changes
                </Text>
              )}
              <Group gap="xs">
                <Button
                  variant="default"
                  disabled={!dirty || pending}
                  onClick={discard}
                >
                  Discard
                </Button>
                <Button
                  loading={pending}
                  disabled={!dirty}
                  onClick={() => startTransition(() => dispatch(payload))}
                >
                  Save access
                </Button>
              </Group>
            </Group>
          </Stack>
        </Paper>
      )}
    </Stack>
  );
}
