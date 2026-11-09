'use client';

import { Button, Group, Select, Stack, Switch, Textarea } from '@mantine/core';
import { useActionState } from 'react';
import type { BinDetail } from '@dax/inventory-contract';
import { StateAlert } from '../../../../../../components/state-alert';
import { fieldError, IDLE } from '../../../../../../lib/action-state';
import { BIN_KIND_OPTIONS } from '../../../../../../lib/format';
import { updateBin } from '../../actions';

export function BinEdit({ bin }: { bin: BinDetail }) {
  const [state, action, pending] = useActionState(updateBin, IDLE);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={bin.id} />
      <input type="hidden" name="version" value={bin.version} />
      <Stack>
        <StateAlert state={state} />
        <Select
          name="kind"
          label="Kind"
          description="Receiving, quarantine and warranty bins hold stock that is not free to issue."
          data={BIN_KIND_OPTIONS}
          defaultValue={bin.kind}
          allowDeselect={false}
          error={fieldError(state, 'kind')}
          size="md"
          maw={320}
        />
        <Switch
          name="active"
          label="Active"
          description="Turn off bins that are no longer used."
          defaultChecked={bin.active}
          size="md"
        />
        <Textarea
          name="notes"
          label="Notes"
          autosize
          minRows={2}
          maxLength={300}
          defaultValue={bin.notes ?? ''}
          error={fieldError(state, 'notes')}
          size="md"
        />
        <Group>
          <Button type="submit" loading={pending} size="md">
            Save changes
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
