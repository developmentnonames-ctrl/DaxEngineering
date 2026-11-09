'use client';

import { Button, Group, Stack, Textarea } from '@mantine/core';
import { useActionState } from 'react';
import { StateAlert } from '../../../../../../components/state-alert';
import { fieldError, IDLE } from '../../../../../../lib/action-state';
import { closeDiscrepancy, saveDiscrepancyNotes } from '../../_lib/actions';

export function NotesForm({
  id,
  version,
  notes,
}: {
  id: string;
  version: number;
  notes: string | null;
}) {
  const [state, action, pending] = useActionState(saveDiscrepancyNotes, IDLE);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="version" value={version} />
      <Stack gap="sm">
        <StateAlert state={state} />
        <Textarea
          name="notes"
          label="Notes for the supplier claim"
          description="What was wrong, how it was packed, who was told."
          autosize
          minRows={3}
          maxLength={1000}
          defaultValue={notes ?? ''}
          error={fieldError(state, 'notes')}
          size="md"
        />
        <Group>
          <Button type="submit" variant="default" loading={pending} size="md">
            Save notes
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

export function CloseForm({ id, version }: { id: string; version: number }) {
  const [state, action, pending] = useActionState(closeDiscrepancy, IDLE);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="version" value={version} />
      <Stack gap="sm">
        <StateAlert state={state} />
        <Textarea
          name="note"
          label="How was it settled?"
          description="For example: credit note received, replacement sent, accepted as is."
          required
          minLength={3}
          maxLength={500}
          autosize
          minRows={2}
          error={fieldError(state, 'note')}
          size="md"
        />
        <Group>
          <Button type="submit" loading={pending} size="md">
            Close discrepancy
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
