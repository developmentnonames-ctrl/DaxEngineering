'use client';

import {
  Button,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { startTransition, useActionState, useState } from 'react';
import type { MrnDto } from '@dax/inventory-contract';
import { StateAlert } from '../../../../../components/state-alert';
import { fieldError, IDLE } from '../../../../../lib/action-state';
import { trimQty } from '../../../../../lib/format';
import { saveMrn } from '../_lib/actions';
import { CustomerPicker, DepartmentSelect } from '../_lib/header-fields';
import { MRN_SUBTYPE_OPTIONS, type MrnSubtype } from '../_lib/labels';
import { type RequestLine, RequestLines } from '../_lib/request-lines';

export function MrnForm({
  mrn,
  departments,
  canSubmit,
}: {
  mrn?: MrnDto;
  departments: { id: string; name: string }[];
  canSubmit: boolean;
}) {
  const [state, dispatch, pending] = useActionState(saveMrn, IDLE);
  const [subtype, setSubtype] = useState<MrnSubtype>(mrn?.subtype ?? 'PRT');
  const [departmentId, setDepartmentId] = useState<string | null>(
    mrn?.department.id ??
      (departments.length === 1 ? (departments[0]?.id ?? null) : null),
  );
  const [customerId, setCustomerId] = useState<string | null>(
    mrn?.customer?.id ?? null,
  );
  const [jobNumber, setJobNumber] = useState(mrn?.jobNumber ?? '');
  const [customerPo, setCustomerPo] = useState(mrn?.customerPo ?? '');
  const [quotationRef, setQuotationRef] = useState(mrn?.quotationRef ?? '');
  const [notes, setNotes] = useState(mrn?.notes ?? '');
  const [lines, setLines] = useState<RequestLine[]>(
    mrn?.lines.map((l) => ({
      key: l.id,
      id: l.id,
      part: { ...l.item, free: l.freeNow },
      qty: trimQty(l.qtyRequested),
      notes: l.notes ?? '',
    })) ?? [],
  );
  const err = (key: string) => fieldError(state, key);
  const known = mrn
    ? departments.some((d) => d.id === mrn.department.id)
      ? departments
      : [mrn.department, ...departments]
    : departments;

  function send(submit: boolean) {
    const body = {
      subtype,
      departmentId: departmentId ?? '',
      customerId,
      jobNumber,
      customerPo,
      quotationRef,
      notes,
      lines: lines.map((l) => ({
        id: l.id,
        itemId: l.part.id,
        qty: l.qty.trim(),
        notes: l.notes,
      })),
      ...(mrn ? { version: mrn.version } : {}),
    };
    startTransition(() => dispatch({ id: mrn?.id, body, submit }));
  }

  return (
    <Stack gap="lg">
      <StateAlert state={state} />
      <Stack gap={4}>
        <Text size="sm" fw={500}>
          Request type
        </Text>
        <SegmentedControl
          fullWidth
          size="md"
          value={subtype}
          onChange={(v) =>
            setSubtype(v === 'SRV' ? 'SRV' : v === 'SAL' ? 'SAL' : 'PRT')
          }
          data={MRN_SUBTYPE_OPTIONS}
        />
      </Stack>
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <DepartmentSelect
          departments={known}
          value={departmentId}
          onChange={setDepartmentId}
          error={err('departmentId')}
        />
        <CustomerPicker
          initial={
            mrn?.customer
              ? { value: mrn.customer.id, label: mrn.customer.name }
              : null
          }
          value={customerId}
          onChange={setCustomerId}
          error={err('customerId')}
        />
        <TextInput
          label="Job number"
          maxLength={40}
          value={jobNumber}
          onChange={(e) => setJobNumber(e.currentTarget.value)}
          error={err('jobNumber')}
          size="md"
        />
        <TextInput
          label="Customer PO"
          maxLength={40}
          value={customerPo}
          onChange={(e) => setCustomerPo(e.currentTarget.value)}
          error={err('customerPo')}
          size="md"
        />
        <TextInput
          label="Quotation reference"
          maxLength={40}
          value={quotationRef}
          onChange={(e) => setQuotationRef(e.currentTarget.value)}
          error={err('quotationRef')}
          size="md"
        />
      </SimpleGrid>
      <Textarea
        label="Notes"
        autosize
        minRows={2}
        maxLength={1000}
        value={notes}
        onChange={(e) => setNotes(e.currentTarget.value)}
        error={err('notes')}
        size="md"
      />
      <RequestLines
        title="Parts needed"
        lines={lines}
        onChange={setLines}
        errors={err}
        withNotes
      />
      <div className="dax-bar">
        <span className="note">
          Nothing is reserved until Stores checks it.
        </span>
        <Button
          size="lg"
          variant="default"
          loading={pending}
          onClick={() => send(false)}
        >
          {mrn ? 'Save' : 'Save draft'}
        </Button>
        {canSubmit ? (
          <Button size="lg" loading={pending} onClick={() => send(true)}>
            Submit
          </Button>
        ) : null}
      </div>
    </Stack>
  );
}
