'use client';

import { Button, Group, Stack, Switch, Text, TextInput } from '@mantine/core';
import { startTransition, useActionState, useState } from 'react';
import type { ZoneDto } from '@dax/inventory-contract';
import { Empty, Pill } from '@dax/web-shell';
import { AppLink } from '../../../../components/links';
import { StateAlert } from '../../../../components/state-alert';
import { fieldError, IDLE } from '../../../../lib/action-state';
import { createZone, updateZone } from './actions';

export function AddZoneForm() {
  const [state, action, pending] = useActionState(createZone, IDLE);
  return (
    <form action={action} className="dax-zone-add">
      <Stack gap="xs">
        <StateAlert state={state} />
        {/* No hints under the boxes, so labels, boxes and the button line up. */}
        <Group align="flex-end" gap="sm" wrap="wrap">
          <TextInput
            key={`code-${state.message ?? ''}`}
            name="code"
            label="Zone code"
            placeholder="e.g. ENG"
            title="One to three letters"
            required
            maxLength={3}
            autoCapitalize="characters"
            styles={{ input: { textTransform: 'uppercase' } }}
            error={fieldError(state, 'code')}
            w={140}
          />
          <TextInput
            key={`name-${state.message ?? ''}`}
            name="name"
            label="Name"
            placeholder="e.g. Engine parts"
            required
            maxLength={60}
            error={fieldError(state, 'name')}
            style={{ flex: '1 1 220px' }}
          />
          <Button type="submit" loading={pending} size="md">
            Add zone
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

function ZoneCard({ zone, canManage }: { zone: ZoneDto; canManage: boolean }) {
  const [state, dispatch, pending] = useActionState(updateZone, IDLE);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(zone.name);
  const trimmed = name.trim();
  const save = (changes: { name?: string; active?: boolean }) =>
    startTransition(() => dispatch({ id: zone.id, ...changes }));
  const cancel = () => {
    setName(zone.name);
    setEditing(false);
  };

  return (
    <div className="dax-zone-card" data-off={zone.active ? undefined : 'true'}>
      <div className="dax-zone-card-top">
        <span className="dax-zone">{zone.code}</span>
        <div className="dax-zone-card-text">
          {editing ? (
            <TextInput
              aria-label={`Name of zone ${zone.code}`}
              value={name}
              autoFocus
              size="sm"
              onChange={(e) => setName(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') cancel();
                if (e.key === 'Enter' && trimmed && trimmed !== zone.name) {
                  e.preventDefault();
                  save({ name: trimmed });
                }
              }}
              disabled={pending}
            />
          ) : (
            <b className="dax-zone-card-name">{zone.name}</b>
          )}
          <AppLink href={`/inventory/locations?zoneId=${zone.id}`} size="sm">
            {zone.binCount} {zone.binCount === 1 ? 'bin' : 'bins'}
          </AppLink>
        </div>
        {canManage ? (
          <Switch
            aria-label={`Zone ${zone.code} active`}
            label={zone.active ? 'Active' : 'Off'}
            checked={zone.active}
            disabled={pending}
            onChange={(e) => save({ active: e.currentTarget.checked })}
          />
        ) : zone.active ? null : (
          <Pill>Off</Pill>
        )}
      </div>
      {canManage ? (
        <Group gap="xs" justify="flex-end">
          {editing ? (
            <>
              <Button
                variant="default"
                size="xs"
                onClick={cancel}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button
                size="xs"
                loading={pending}
                disabled={!trimmed || trimmed === zone.name}
                onClick={() => save({ name: trimmed })}
              >
                Save name
              </Button>
            </>
          ) : (
            <Button variant="subtle" size="xs" onClick={() => setEditing(true)}>
              Rename
            </Button>
          )}
        </Group>
      ) : null}
      {state.error ? (
        <Text size="xs" c="red">
          {state.error}
        </Text>
      ) : null}
    </div>
  );
}

export function ZoneList({
  zones,
  canManage,
}: {
  zones: ZoneDto[];
  canManage: boolean;
}) {
  if (zones.length === 0) {
    return <Empty title="No zones yet">Add a zone before adding bins.</Empty>;
  }
  return (
    <div className="dax-zone-grid">
      {zones.map((z) => (
        <ZoneCard
          key={`${z.id}:${z.name}:${z.active}`}
          zone={z}
          canManage={canManage}
        />
      ))}
    </div>
  );
}
