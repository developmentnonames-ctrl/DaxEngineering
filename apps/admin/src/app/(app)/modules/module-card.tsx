'use client';

import { Badge, Group, Paper, Stack, Switch, Text } from '@mantine/core';
import { startTransition, useActionState } from 'react';
import { StateAlert } from '../../../components/state-alert';
import { IDLE } from '../../../lib/action-state';
import { toggleModule } from './actions';

export function ModuleCard({
  moduleKey,
  name,
  description,
  enabled,
  toggleable,
  locked,
  dependsOn,
  requiredBy,
}: {
  moduleKey: string;
  name: string;
  description: string | null;
  enabled: boolean;
  toggleable: boolean;
  locked: boolean;
  dependsOn: string[];
  requiredBy: string[];
}) {
  const [state, dispatch, pending] = useActionState(toggleModule, IDLE);
  return (
    <Paper withBorder p="md">
      <Stack gap="xs">
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <Stack gap={2}>
            <Group gap="xs">
              <Text fw={600}>{name}</Text>
              {locked ? <Badge variant="light">Always on</Badge> : null}
            </Group>
            {description ? (
              <Text size="sm" c="dimmed">
                {description}
              </Text>
            ) : null}
          </Stack>
          <Switch
            aria-label={`${name} on or off`}
            label={enabled ? 'On' : 'Off'}
            checked={enabled}
            disabled={!toggleable || pending}
            onChange={(e) => {
              const next = e.currentTarget.checked;
              startTransition(() =>
                dispatch({ key: moduleKey, input: { enabled: next } }),
              );
            }}
          />
        </Group>
        {dependsOn.length ? (
          <Text size="xs" c="dimmed">
            Needs: {dependsOn.join(', ')}
          </Text>
        ) : null}
        {requiredBy.length ? (
          <Text size="xs" c="dimmed">
            Needed by: {requiredBy.join(', ')}
          </Text>
        ) : null}
        <StateAlert state={state} />
      </Stack>
    </Paper>
  );
}
