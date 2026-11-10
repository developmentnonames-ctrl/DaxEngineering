'use client';

import {
  Button,
  Select,
  SimpleGrid,
  Stack,
  Textarea,
  TextInput,
} from '@mantine/core';
import { startTransition, useActionState, useState } from 'react';
import { StateAlert } from '../../../../../components/state-alert';
import { fieldError, IDLE } from '../../../../../lib/action-state';
import { CustomerPicker } from '../../issuing/_lib/header-fields';
import { searchSuppliers } from '../../receiving/_lib/actions';
import { ItemPicker, RemotePicker } from '../../_lib/pickers';
import type { PickerOption } from '../../_lib/search-actions';
import { saveTag } from './actions';
import { CUSTODY_NOTE } from './labels';

export interface TagFormValues {
  id: string;
  version: number;
  item: PickerOption;
  itemLocked: boolean;
  qty: string;
  serialNo: string;
  machineModelId: string | null;
  machineSerial: string;
  jobNumber: string;
  customer: PickerOption | null | undefined;
  supplier: PickerOption | null;
  supplierRequired: boolean;
  claimNumber: string;
  fault: string;
}

export function TagForm({
  models,
  initial,
}: {
  models: PickerOption[];
  initial?: TagFormValues;
}) {
  const [state, dispatch, pending] = useActionState(saveTag, IDLE);
  const [itemId, setItemId] = useState<string | null>(
    initial?.item.value ?? null,
  );
  const [qty, setQty] = useState(initial?.qty ?? '1');
  const [serialNo, setSerialNo] = useState(initial?.serialNo ?? '');
  const [machineModelId, setMachineModelId] = useState<string | null>(
    initial?.machineModelId ?? null,
  );
  const [machineSerial, setMachineSerial] = useState(
    initial?.machineSerial ?? '',
  );
  const [jobNumber, setJobNumber] = useState(initial?.jobNumber ?? '');
  const [customerId, setCustomerId] = useState<string | null>(
    initial?.customer?.value ?? null,
  );
  const [supplierId, setSupplierId] = useState<string | null>(
    initial?.supplier?.value ?? null,
  );
  const [claimNumber, setClaimNumber] = useState(initial?.claimNumber ?? '');
  const [fault, setFault] = useState(initial?.fault ?? '');
  const err = (key: string) => fieldError(state, key);
  const showCustomer = !initial || initial.customer !== undefined;

  function submit() {
    startTransition(() =>
      dispatch({
        id: initial?.id,
        body: {
          ...(initial ? { version: initial.version } : {}),
          itemId: itemId ?? '',
          qty: qty.trim(),
          serialNo,
          machineModelId,
          machineSerial,
          jobNumber,
          ...(showCustomer ? { customerId } : {}),
          supplierId,
          claimNumber,
          fault,
        },
      }),
    );
  }

  return (
    <Stack gap="lg">
      <StateAlert state={state} />
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <ItemPicker
          label="Failed part"
          required
          initial={initial?.item ?? null}
          value={itemId}
          onChange={setItemId}
          disabled={initial?.itemLocked}
          description={
            initial?.itemLocked ? 'Set by the return it came from' : undefined
          }
          error={err('itemId')}
          size="md"
        />
        <TextInput
          label="Quantity"
          required
          inputMode="decimal"
          value={qty}
          onChange={(e) => setQty(e.currentTarget.value)}
          error={err('qty')}
          size="md"
        />
        <TextInput
          label="Part serial number"
          maxLength={60}
          value={serialNo}
          onChange={(e) => setSerialNo(e.currentTarget.value)}
          error={err('serialNo')}
          size="md"
        />
        <TextInput
          label="Job number"
          maxLength={40}
          value={jobNumber}
          onChange={(e) => setJobNumber(e.currentTarget.value)}
          error={err('jobNumber')}
          size="md"
        />
        <Select
          label="Machine model"
          description="Optional"
          data={models}
          value={machineModelId}
          onChange={setMachineModelId}
          searchable
          clearable
          nothingFoundMessage="No matching model"
          comboboxProps={{ withinPortal: true }}
          error={err('machineModelId')}
          size="md"
        />
        <TextInput
          label="Machine serial number"
          maxLength={60}
          value={machineSerial}
          onChange={(e) => setMachineSerial(e.currentTarget.value)}
          error={err('machineSerial')}
          size="md"
        />
        {showCustomer ? (
          <CustomerPicker
            initial={initial?.customer ?? null}
            value={customerId}
            onChange={setCustomerId}
            error={err('customerId')}
          />
        ) : null}
      </SimpleGrid>
      <Textarea
        label="Fault"
        description="What failed and how. For example: motor seized after two hours of running."
        required
        autosize
        minRows={3}
        maxLength={1000}
        value={fault}
        onChange={(e) => setFault(e.currentTarget.value)}
        error={err('fault')}
        size="md"
      />
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <RemotePicker
          label="Supplier"
          description={
            initial?.supplierRequired ? undefined : 'Optional until it is sent'
          }
          required={initial?.supplierRequired}
          search={searchSuppliers}
          initial={initial?.supplier ?? null}
          value={supplierId}
          onChange={setSupplierId}
          placeholder="Type a supplier name"
          error={err('supplierId')}
          size="md"
        />
        <TextInput
          label="Supplier claim number"
          description="Optional"
          maxLength={60}
          value={claimNumber}
          onChange={(e) => setClaimNumber(e.currentTarget.value)}
          error={err('claimNumber')}
          size="md"
        />
      </SimpleGrid>
      <div className="dax-bar">
        <span className="note">{CUSTODY_NOTE}</span>
        <Button size="lg" loading={pending} onClick={submit}>
          {initial ? 'Save changes' : 'Tag the part'}
        </Button>
      </div>
    </Stack>
  );
}
