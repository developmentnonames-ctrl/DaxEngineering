'use client';

import {
  Button,
  Group,
  MultiSelect,
  Select,
  SimpleGrid,
  Stack,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useActionState, useState } from 'react';
import type { CatalogLists, ItemDetail } from '@dax/inventory-contract';
import { StateAlert } from '../../../../../components/state-alert';
import { fieldError, IDLE } from '../../../../../lib/action-state';
import { trimQty, UOM_OPTIONS } from '../../../../../lib/format';
import { BinPicker } from '../../_lib/pickers';
import { saveItem } from './actions';

export function ItemForm({
  catalog,
  item,
}: {
  catalog: CatalogLists;
  item?: ItemDetail;
}) {
  const [state, action, pending] = useActionState(saveItem, IDLE);
  const [binId, setBinId] = useState<string | null>(
    item?.defaultBin?.id ?? null,
  );
  const err = (key: string) => fieldError(state, key);
  const chosenModels = new Set(item?.machineModels.map((m) => m.id) ?? []);

  const brands = catalog.brands
    .filter((b) => b.active || b.id === item?.brand.id)
    .map((b) => ({ value: b.id, label: b.name }));
  if (item && !brands.some((b) => b.value === item.brand.id)) {
    brands.push({ value: item.brand.id, label: item.brand.name });
  }
  const models = catalog.machineModels
    .filter((m) => m.active || chosenModels.has(m.id))
    .map((m) => ({
      value: m.id,
      label: m.brand ? `${m.name} (${m.brand.name})` : m.name,
    }));
  for (const m of item?.machineModels ?? []) {
    if (!models.some((o) => o.value === m.id))
      models.push({ value: m.id, label: m.name });
  }

  return (
    <form action={action}>
      {item ? (
        <>
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="version" value={item.version} />
        </>
      ) : null}
      <Stack>
        <StateAlert state={state} />
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <TextInput
            name="partNo"
            label="Part number"
            description="As printed by the maker. Spaces and dashes are ignored when matching."
            required
            maxLength={60}
            autoCapitalize="characters"
            spellCheck={false}
            defaultValue={item?.partNo ?? ''}
            error={err('partNo')}
            size="md"
          />
          <Select
            name="brandId"
            label="Brand"
            description="Missing a brand? Add it under Brands and models."
            required
            searchable
            data={brands}
            defaultValue={item?.brand.id ?? null}
            nothingFoundMessage="No matching brand"
            error={err('brandId')}
            size="md"
          />
        </SimpleGrid>
        <TextInput
          name="description"
          label="Description"
          required
          maxLength={200}
          defaultValue={item?.description ?? ''}
          error={err('description')}
          size="md"
        />
        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          <Select
            name="uom"
            label="Unit"
            required
            data={UOM_OPTIONS}
            defaultValue={item?.uom ?? 'PCS'}
            allowDeselect={false}
            error={err('uom')}
            size="md"
          />
          <TextInput
            name="minQty"
            label="Minimum stock"
            description="Flag the item when free stock drops below this."
            inputMode="decimal"
            defaultValue={item ? trimQty(item.minQty) : '0'}
            error={err('minQty')}
            size="md"
          />
          <BinPicker
            name="defaultBinId"
            label="Usual bin"
            initial={
              item?.defaultBin
                ? { value: item.defaultBin.id, label: item.defaultBin.code }
                : null
            }
            value={binId}
            onChange={setBinId}
            error={err('defaultBinId')}
            size="md"
          />
        </SimpleGrid>
        <MultiSelect
          name="machineModelIds"
          label="Fits machine models"
          searchable
          clearable
          data={models}
          defaultValue={item?.machineModels.map((m) => m.id) ?? []}
          nothingFoundMessage="No matching model"
          error={err('machineModelIds')}
          size="md"
        />
        <Textarea
          name="notes"
          label="Notes"
          autosize
          minRows={2}
          maxLength={1000}
          defaultValue={item?.notes ?? ''}
          error={err('notes')}
          size="md"
        />
        <Group>
          <Button type="submit" loading={pending} size="md">
            {item ? 'Save changes' : 'Add item'}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
