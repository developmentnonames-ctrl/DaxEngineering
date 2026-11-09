'use client';

import { Button, Group, SimpleGrid, Stack, TextInput } from '@mantine/core';
import { useActionState, useState } from 'react';
import { StateAlert } from '../../../../../../components/state-alert';
import { fieldError, IDLE } from '../../../../../../lib/action-state';
import { RemotePicker } from '../../../_lib/pickers';
import { searchSuppliers, startWalkIn } from '../../_lib/actions';

export function WalkInForm() {
  const [state, action, pending] = useActionState(startWalkIn, IDLE);
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const err = (key: string) => fieldError(state, key);
  return (
    <form action={action}>
      <Stack>
        <StateAlert state={state} />
        <RemotePicker
          name="supplierId"
          label="Supplier"
          description="Foreign or local is taken from the supplier. You can change it before posting."
          required
          search={searchSuppliers}
          initial={null}
          value={supplierId}
          onChange={setSupplierId}
          placeholder="Type a supplier name"
          error={err('supplierId')}
          size="lg"
        />
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <TextInput
            name="deliveryNote"
            label="Delivery note number"
            maxLength={60}
            autoComplete="off"
            error={err('deliveryNote')}
            size="lg"
          />
          <TextInput
            name="deliveryDate"
            type="date"
            label="Date on the delivery note"
            description="For information. Stock is received today."
            error={err('deliveryDate')}
            size="lg"
          />
        </SimpleGrid>
        <Group>
          <Button type="submit" size="lg" loading={pending}>
            Start counting
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
