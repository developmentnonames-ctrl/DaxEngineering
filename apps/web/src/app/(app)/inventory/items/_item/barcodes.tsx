'use client';

import {
  Alert,
  Button,
  Group,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { startTransition, useActionState } from 'react';
import { BARCODE_KINDS, type ItemDetail } from '@dax/inventory-contract';
import { Empty, Icon, Pill } from '@dax/web-shell';
import { StateAlert } from '../../../../../components/state-alert';
import { fieldError, IDLE } from '../../../../../lib/action-state';
import { addBarcode, removeBarcode } from './actions';

type BarcodeKind = (typeof BARCODE_KINDS)[number];

const KIND_LABELS: Record<BarcodeKind, string> = {
  MANUFACTURER: 'Maker',
  SUPPLIER: 'Supplier',
  ALTERNATE: 'Other',
};

function BarcodeRow({
  itemId,
  barcode,
  canEdit,
}: {
  itemId: string;
  barcode: ItemDetail['barcodes'][number];
  canEdit: boolean;
}) {
  const [state, dispatch, pending] = useActionState(removeBarcode, IDLE);
  return (
    <Stack
      gap={2}
      className="dax-inset"
      style={{ padding: '8px 8px 8px 16px' }}
    >
      <Group justify="space-between" wrap="nowrap">
        <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
          <Icon name="barcode" size={18} />
          <span className="dax-mono" style={{ overflowWrap: 'anywhere' }}>
            {barcode.code}
          </span>
          <Pill>{KIND_LABELS[barcode.kind]}</Pill>
        </Group>
        {canEdit ? (
          <Button
            variant="subtle"
            color="red"
            loading={pending}
            onClick={() =>
              startTransition(() =>
                dispatch({ id: itemId, barcodeId: barcode.id }),
              )
            }
          >
            Remove
          </Button>
        ) : null}
      </Group>
      {state.error ? (
        <Text size="xs" c="red">
          {state.error}
        </Text>
      ) : null}
    </Stack>
  );
}

export function Barcodes({
  item,
  canEdit,
}: {
  item: ItemDetail;
  canEdit: boolean;
}) {
  const [state, action, pending] = useActionState(addBarcode, IDLE);
  return (
    <Stack gap="sm">
      {item.barcodes.length === 0 ? (
        <Empty title="No barcodes yet">
          Add the maker&apos;s barcode so a scan finds this item.
        </Empty>
      ) : (
        item.barcodes.map((b) => (
          <BarcodeRow
            key={b.id}
            itemId={item.id}
            barcode={b}
            canEdit={canEdit}
          />
        ))
      )}
      {canEdit ? (
        <form action={action}>
          <input type="hidden" name="id" value={item.id} />
          <Stack gap="xs">
            {state.ok ? <StateAlert state={state} /> : null}
            {state.error && !state.fields ? (
              <Alert color="red">{state.error}</Alert>
            ) : null}
            <Group align="flex-end" gap="sm" wrap="wrap">
              <TextInput
                key={state.message}
                name="code"
                label="New barcode"
                placeholder="Scan or type"
                required
                minLength={3}
                maxLength={64}
                autoComplete="off"
                spellCheck={false}
                error={fieldError(state, 'code')}
                style={{ flex: '1 1 200px' }}
                size="md"
              />
              <Select
                name="kind"
                label="Type"
                data={BARCODE_KINDS.map((k) => ({
                  value: k,
                  label: KIND_LABELS[k],
                }))}
                defaultValue="MANUFACTURER"
                allowDeselect={false}
                style={{ flex: '0 1 160px' }}
                size="md"
              />
              <Button type="submit" loading={pending} size="md">
                Add barcode
              </Button>
            </Group>
          </Stack>
        </form>
      ) : null}
    </Stack>
  );
}
