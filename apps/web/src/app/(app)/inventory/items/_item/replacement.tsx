'use client';

import { Alert, Button, Group, Stack, Text } from '@mantine/core';
import { startTransition, useActionState, useState } from 'react';
import type { ItemDetail } from '@dax/inventory-contract';
import { AppLink } from '../../../../../components/links';
import { IDLE } from '../../../../../lib/action-state';
import { ItemPicker } from '../../_lib/pickers';
import { setReplacement } from './actions';

export function Replacement({
  item,
  canEdit,
}: {
  item: ItemDetail;
  canEdit: boolean;
}) {
  const [state, dispatch, pending] = useActionState(setReplacement, IDLE);
  const [choice, setChoice] = useState<string | null>(null);
  const save = (replacementId: string | null) =>
    startTransition(() =>
      dispatch({ id: item.id, version: item.version, replacementId }),
    );

  return (
    <Stack gap="sm">
      {item.supersededBy ? (
        <Group justify="space-between" wrap="wrap">
          <Text size="sm">
            Replaced by{' '}
            <AppLink href={`/inventory/items/${item.supersededBy.id}`} fw={600}>
              <span className="dax-mono">{item.supersededBy.partNo}</span> (
              {item.supersededBy.brand})
            </AppLink>
          </Text>
          {canEdit ? (
            <Button
              variant="default"
              color="red"
              loading={pending}
              onClick={() => save(null)}
            >
              Remove replacement
            </Button>
          ) : null}
        </Group>
      ) : (
        <Text size="sm" c="dimmed">
          This part has not been replaced.
        </Text>
      )}
      {item.supersedes.length ? (
        <Text size="sm">
          Replaces:{' '}
          {item.supersedes.map((old, i) => (
            <span key={old.id}>
              {i > 0 ? ', ' : ''}
              <AppLink href={`/inventory/items/${old.id}`}>
                <span className="dax-mono">{old.partNo}</span> ({old.brand})
              </AppLink>
            </span>
          ))}
        </Text>
      ) : null}
      {canEdit ? (
        <Group align="flex-end" gap="sm" wrap="wrap">
          <ItemPicker
            label={item.supersededBy ? 'Change replacement' : 'Replaced by'}
            excludeId={item.id}
            initial={null}
            value={choice}
            onChange={setChoice}
            style={{ flex: '1 1 260px' }}
            size="md"
          />
          <Button
            onClick={() => save(choice)}
            disabled={!choice}
            loading={pending}
            size="md"
          >
            Save replacement
          </Button>
        </Group>
      ) : null}
      {state.error ? <Alert color="red">{state.error}</Alert> : null}
    </Stack>
  );
}
