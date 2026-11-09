'use client';

import { Button, SimpleGrid, Stack, Textarea } from '@mantine/core';
import { startTransition, useActionState, useState } from 'react';
import { StateAlert } from '../../../../../../components/state-alert';
import { fieldError, IDLE } from '../../../../../../lib/action-state';
import { createHold } from '../../_lib/actions';
import { CustomerPicker, DepartmentSelect } from '../../_lib/header-fields';
import { type RequestLine, RequestLines } from '../../_lib/request-lines';

export function HoldForm({
  departments,
}: {
  departments: { id: string; name: string }[];
}) {
  const [state, dispatch, pending] = useActionState(createHold, IDLE);
  const [departmentId, setDepartmentId] = useState<string | null>(
    departments.length === 1 ? (departments[0]?.id ?? null) : null,
  );
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [lines, setLines] = useState<RequestLine[]>([]);
  const err = (key: string) => fieldError(state, key);

  function submit() {
    startTransition(() =>
      dispatch({
        departmentId: departmentId ?? '',
        customerId,
        reason,
        lines: lines.map((l) => ({ itemId: l.part.id, qty: l.qty.trim() })),
      }),
    );
  }

  return (
    <Stack gap="lg">
      <StateAlert state={state} />
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <DepartmentSelect
          departments={departments}
          value={departmentId}
          onChange={setDepartmentId}
          error={err('departmentId')}
        />
        <CustomerPicker
          initial={null}
          value={customerId}
          onChange={setCustomerId}
          error={err('customerId')}
        />
      </SimpleGrid>
      <Textarea
        label="Reason"
        description="For example: quotation sent, waiting for the customer's order."
        autosize
        minRows={2}
        maxLength={300}
        value={reason}
        onChange={(e) => setReason(e.currentTarget.value)}
        error={err('reason')}
        size="md"
      />
      <RequestLines
        title="Parts to hold"
        lines={lines}
        onChange={setLines}
        errors={err}
      />
      <div className="dax-bar">
        <span className="note">Held stock is not free until released.</span>
        <Button size="lg" loading={pending} onClick={submit}>
          Place hold
        </Button>
      </div>
    </Stack>
  );
}
