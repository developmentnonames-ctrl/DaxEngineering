'use client';

import {
  Button,
  Checkbox,
  Group,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { startTransition, useActionState, useState } from 'react';
import { SectionCard } from '@dax/web-shell';
import { StateAlert } from '../../../../components/state-alert';
import { type ActionState, IDLE } from '../../../../lib/action-state';
import { type AccessPayload, saveAccess } from '../actions';

interface RoleOption {
  id: string;
  name: string;
  description: string | null;
  locked: boolean;
}

type RoleRow = AccessPayload['roles'][number];

export function AccessForm({
  userId,
  canEdit,
  roles,
  departments,
  current,
}: {
  userId: string;
  canEdit: boolean;
  roles: RoleOption[];
  departments: { id: string; name: string }[];
  current: { roles: RoleRow[]; departmentIds: string[] };
}) {
  const [state, action, pending] = useActionState<ActionState, AccessPayload>(
    saveAccess,
    IDLE,
  );
  const [selected, setSelected] = useState<Map<string, string | null>>(
    () => new Map(current.roles.map((r) => [r.roleId, r.expiresOn])),
  );
  const [departmentIds, setDepartmentIds] = useState<string[]>(
    current.departmentIds,
  );

  const toggleRole = (roleId: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Map(prev);
      if (on) next.set(roleId, null);
      else next.delete(roleId);
      return next;
    });
  const setExpiry = (roleId: string, day: string) =>
    setSelected((prev) => new Map(prev).set(roleId, day || null));

  const submit = () =>
    startTransition(() =>
      action({
        userId,
        roles: [...selected].map(([roleId, expiresOn]) => ({
          roleId,
          expiresOn,
        })),
        departmentIds,
      }),
    );

  return (
    <Stack maw={760} gap="lg">
      <StateAlert state={state} />
      <SectionCard
        title="Roles"
        note="A user gets everything their roles allow. Leave the date empty for no expiry."
      >
        <Stack>
          {roles.length === 0 ? (
            <Text size="sm" c="dimmed">
              No roles.
            </Text>
          ) : null}
          {roles.map((role) => {
            const on = selected.has(role.id);
            const disabled = !canEdit || role.locked || pending;
            return (
              <Group key={role.id} justify="space-between" wrap="wrap">
                <Checkbox
                  checked={on}
                  disabled={disabled}
                  onChange={(e) => toggleRole(role.id, e.currentTarget.checked)}
                  label={role.name}
                  description={
                    role.locked && canEdit
                      ? 'Only super admins can change this role.'
                      : (role.description ?? undefined)
                  }
                />
                {on ? (
                  <TextInput
                    type="date"
                    size="xs"
                    aria-label={`${role.name} expires on`}
                    placeholder="No expiry"
                    value={selected.get(role.id) ?? ''}
                    disabled={disabled}
                    onChange={(e) => setExpiry(role.id, e.currentTarget.value)}
                    error={
                      state.fields?.[
                        `roles.${[...selected.keys()].indexOf(role.id)}.expiresOn`
                      ]
                    }
                  />
                ) : null}
              </Group>
            );
          })}
        </Stack>
      </SectionCard>
      <SectionCard
        title="Departments"
        note="Department-wide permissions cover only these departments."
      >
        <Stack>
          <Checkbox.Group value={departmentIds} onChange={setDepartmentIds}>
            <SimpleGrid cols={{ base: 1, xs: 2, sm: 3 }}>
              {departments.map((d) => (
                <Checkbox
                  key={d.id}
                  value={d.id}
                  label={d.name}
                  disabled={!canEdit || pending}
                />
              ))}
            </SimpleGrid>
          </Checkbox.Group>
        </Stack>
      </SectionCard>
      {canEdit ? (
        <Button
          onClick={submit}
          loading={pending}
          disabled={pending}
          style={{ alignSelf: 'flex-start' }}
        >
          Save access
        </Button>
      ) : (
        <Text size="sm" c="dimmed">
          You can't change roles or departments.
        </Text>
      )}
    </Stack>
  );
}
