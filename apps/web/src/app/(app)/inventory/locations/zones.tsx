'use client';

import {
  Button,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
} from '@mantine/core';
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
    <form action={action}>
      <Stack gap="xs">
        <StateAlert state={state} />
        <Group align="flex-end" gap="sm" wrap="wrap">
          <TextInput
            key={`code-${state.message ?? ''}`}
            name="code"
            label="Zone code"
            description="One to three letters"
            required
            maxLength={3}
            autoCapitalize="characters"
            styles={{ input: { textTransform: 'uppercase' } }}
            error={fieldError(state, 'code')}
            w={130}
            size="md"
          />
          <TextInput
            key={`name-${state.message ?? ''}`}
            name="name"
            label="Name"
            placeholder="e.g. Main store"
            required
            maxLength={60}
            error={fieldError(state, 'name')}
            style={{ flex: '1 1 200px' }}
            size="md"
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
  const [name, setName] = useState(zone.name);
  const renamed = name.trim() !== zone.name && name.trim() !== '';
  const save = (changes: { name?: string; active?: boolean }) =>
    startTransition(() => dispatch({ id: zone.id, ...changes }));

  return (
    <Paper p="md" radius="lg">
      <Stack gap={6}>
        <Group justify="space-between" wrap="nowrap">
          <Group gap="xs" wrap="nowrap">
            <span className="dax-zone">{zone.code}</span>
            <AppLink href={`/inventory/locations?zoneId=${zone.id}`} size="sm">
              {zone.binCount} {zone.binCount === 1 ? 'bin' : 'bins'}
            </AppLink>
          </Group>
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
        </Group>
        {canManage ? (
          <Group gap="xs" wrap="nowrap">
            <TextInput
              aria-label="Zone name"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              disabled={pending}
              style={{ flex: 1 }}
            />
            {renamed ? (
              <Button
                loading={pending}
                onClick={() => save({ name: name.trim() })}
              >
                Rename
              </Button>
            ) : null}
          </Group>
        ) : (
          <Text size="sm">{zone.name}</Text>
        )}
        {state.error ? (
          <Text size="xs" c="red">
            {state.error}
          </Text>
        ) : null}
      </Stack>
    </Paper>
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
    <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm">
      {zones.map((z) => (
        <ZoneCard
          key={`${z.id}:${z.name}:${z.active}`}
          zone={z}
          canManage={canManage}
        />
      ))}
    </SimpleGrid>
  );
}
