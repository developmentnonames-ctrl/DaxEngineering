'use client';

import {
  Button,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Textarea,
  TextInput,
} from '@mantine/core';
import {
  startTransition,
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { OverrideDto } from '@dax/platform-contract';
import { Empty, Pill, SectionCard } from '@dax/web-shell';
import { StateAlert } from '../../../../components/state-alert';
import {
  type ActionState,
  fieldError,
  IDLE,
} from '../../../../lib/action-state';
import { formatDate, SCOPE_LABELS } from '../../../../lib/format';
import { addOverride, removeOverride } from '../actions';

type Scope = keyof typeof SCOPE_LABELS;

interface PermissionGroup {
  group: string;
  items: { value: string; label: string; scopes: Scope[] }[];
}

export function OverridesPanel({
  userId,
  canEdit,
  overrides,
  permissions,
}: {
  userId: string;
  canEdit: boolean;
  overrides: (OverrideDto & { label: string })[];
  permissions: PermissionGroup[];
}) {
  return (
    <Stack maw={960} gap="lg">
      <OverrideList userId={userId} canEdit={canEdit} overrides={overrides} />
      {canEdit ? (
        <AddOverrideForm userId={userId} permissions={permissions} />
      ) : null}
    </Stack>
  );
}

function OverrideList({
  userId,
  canEdit,
  overrides,
}: {
  userId: string;
  canEdit: boolean;
  overrides: (OverrideDto & { label: string })[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    removeOverride,
    IDLE,
  );
  const note =
    'Grant or deny a single permission for this user only. Deny always wins over roles and grants.';
  if (overrides.length === 0) {
    return (
      <SectionCard title="Overrides" note={note}>
        <Empty title="No overrides" />
      </SectionCard>
    );
  }
  return (
    <SectionCard flush title="Overrides" note={note}>
      {state.error || state.ok ? (
        <div className="dax-card-tools">
          <StateAlert state={state} />
        </div>
      ) : null}
      <Table.ScrollContainer minWidth={680}>
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Effect</Table.Th>
              <Table.Th>Permission</Table.Th>
              <Table.Th>Scope</Table.Th>
              <Table.Th>Reason</Table.Th>
              <Table.Th>Expires</Table.Th>
              {canEdit ? <Table.Th /> : null}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {overrides.map((o) => (
              <Table.Tr key={o.id}>
                <Table.Td>
                  <Pill tone={o.effect === 'DENY' ? 'bad' : 'ok'}>
                    {o.effect === 'DENY' ? 'Deny' : 'Grant'}
                  </Pill>
                </Table.Td>
                <Table.Td>{o.label}</Table.Td>
                <Table.Td>{o.scope ? SCOPE_LABELS[o.scope] : '—'}</Table.Td>
                <Table.Td>{o.reason}</Table.Td>
                <Table.Td>
                  {o.expiresAt ? formatDate(o.expiresAt) : 'Never'}
                </Table.Td>
                {canEdit ? (
                  <Table.Td>
                    <form action={action}>
                      <input type="hidden" name="userId" value={userId} />
                      <input type="hidden" name="overrideId" value={o.id} />
                      <Button
                        type="submit"
                        size="compact-sm"
                        variant="subtle"
                        color="red"
                        disabled={pending}
                      >
                        Remove
                      </Button>
                    </form>
                  </Table.Td>
                ) : null}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </SectionCard>
  );
}

function AddOverrideForm({
  userId,
  permissions,
}: {
  userId: string;
  permissions: PermissionGroup[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    addOverride,
    IDLE,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [permissionKey, setPermissionKey] = useState<string | null>(null);
  const [effect, setEffect] = useState<'GRANT' | 'DENY'>('GRANT');
  const [scope, setScope] = useState<string | null>(null);

  const scopesByKey = useMemo(
    () =>
      new Map(
        permissions.flatMap((g) => g.items.map((i) => [i.value, i.scopes])),
      ),
    [permissions],
  );
  const selectData = useMemo(
    () =>
      permissions
        .filter((g) => g.items.length)
        .map((g) => ({
          group: g.group,
          items: g.items.map((i) => ({ value: i.value, label: i.label })),
        })),
    [permissions],
  );
  const scopes = permissionKey ? (scopesByKey.get(permissionKey) ?? []) : [];
  const needsScope = effect === 'GRANT' && scopes.length > 0;

  useEffect(() => {
    if (!state.ok) return;
    formRef.current?.reset();
    setPermissionKey(null);
    setEffect('GRANT');
    setScope(null);
  }, [state]);

  const err = (field: string) => fieldError(state, field);

  return (
    <SectionCard title="Add override">
      <form
        ref={formRef}
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          startTransition(() => action(data));
        }}
      >
        <Stack>
          <StateAlert state={state} />
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="effect" value={effect} />
          <SegmentedControl
            value={effect}
            onChange={(v) => setEffect(v === 'DENY' ? 'DENY' : 'GRANT')}
            data={[
              { value: 'GRANT', label: 'Grant' },
              { value: 'DENY', label: 'Deny' },
            ]}
            style={{ alignSelf: 'flex-start' }}
          />
          <Select
            name="permissionKey"
            label="Permission"
            placeholder="Search permissions"
            data={selectData}
            value={permissionKey}
            onChange={(v) => {
              setPermissionKey(v);
              const next = v ? (scopesByKey.get(v) ?? []) : [];
              setScope(next[0] ?? null);
            }}
            searchable
            required
            error={err('permissionKey')}
          />
          {needsScope ? (
            <Select
              name="scope"
              label="Scope"
              data={scopes.map((s) => ({ value: s, label: SCOPE_LABELS[s] }))}
              value={scope}
              onChange={setScope}
              allowDeselect={false}
              required
              error={err('scope')}
            />
          ) : null}
          <Textarea
            name="reason"
            label="Reason"
            description="Kept in the audit log."
            autosize
            minRows={2}
            required
            error={err('reason')}
          />
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <TextInput
              type="date"
              name="expiresOn"
              label="Expires on"
              description="Leave empty for no expiry."
              error={err('expiresOn') ?? err('expiresAt')}
            />
          </SimpleGrid>
          <Button
            type="submit"
            loading={pending}
            disabled={pending}
            color={effect === 'DENY' ? 'red' : undefined}
            style={{ alignSelf: 'flex-start' }}
          >
            {effect === 'DENY' ? 'Add deny' : 'Add grant'}
          </Button>
        </Stack>
      </form>
    </SectionCard>
  );
}
