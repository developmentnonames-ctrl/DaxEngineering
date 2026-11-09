'use client';

import {
  Button,
  Group,
  Paper,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
} from '@mantine/core';
import { startTransition, useActionState, useState } from 'react';
import type { BrandDto, MachineModelDto } from '@dax/inventory-contract';
import { Empty, Pill } from '@dax/web-shell';
import { StateAlert } from '../../../../components/state-alert';
import { fieldError, IDLE } from '../../../../lib/action-state';
import {
  createBrand,
  createMachineModel,
  updateBrand,
  updateMachineModel,
} from './actions';

export function AddBrandForm() {
  const [state, action, pending] = useActionState(createBrand, IDLE);
  return (
    <form action={action}>
      <Stack gap="xs">
        <StateAlert state={state} />
        <Group align="flex-end" gap="sm">
          <TextInput
            key={state.message}
            name="name"
            label="New brand"
            placeholder="Brand name"
            required
            maxLength={60}
            error={fieldError(state, 'name')}
            style={{ flex: '1 1 200px' }}
            size="md"
          />
          <Button type="submit" loading={pending} size="md">
            Add brand
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

function ListRow({
  name,
  meta,
  active,
  canManage,
  pending,
  error,
  onSave,
  extra,
}: {
  name: string;
  meta: string;
  active: boolean;
  canManage: boolean;
  pending: boolean;
  error?: string;
  onSave: (changes: { name?: string; active?: boolean }) => void;
  extra?: React.ReactNode;
}) {
  const [draft, setDraft] = useState(name);
  const renamed = draft.trim() !== name && draft.trim() !== '';
  return (
    <Paper p="md" radius="lg">
      <Stack gap={6}>
        <Group justify="space-between" wrap="wrap" gap="sm">
          {canManage ? (
            <Group gap="xs" wrap="nowrap" style={{ flex: '1 1 220px' }}>
              <TextInput
                aria-label="Name"
                value={draft}
                onChange={(e) => setDraft(e.currentTarget.value)}
                disabled={pending}
                style={{ flex: 1 }}
              />
              {renamed ? (
                <Button
                  loading={pending}
                  onClick={() => onSave({ name: draft.trim() })}
                >
                  Rename
                </Button>
              ) : null}
            </Group>
          ) : (
            <Text fw={600}>{name}</Text>
          )}
          <Group gap="sm" wrap="nowrap">
            <Text size="sm" c="dimmed">
              {meta}
            </Text>
            {canManage ? (
              <Switch
                aria-label="Active"
                label={active ? 'Active' : 'Off'}
                checked={active}
                disabled={pending}
                onChange={(e) => onSave({ active: e.currentTarget.checked })}
                size="md"
              />
            ) : (
              <Pill tone={active ? 'ok' : undefined}>
                {active ? 'Active' : 'Off'}
              </Pill>
            )}
          </Group>
        </Group>
        {extra}
        {error ? (
          <Text size="xs" c="red">
            {error}
          </Text>
        ) : null}
      </Stack>
    </Paper>
  );
}

function count(n: number): string {
  return `${n} ${n === 1 ? 'item' : 'items'}`;
}

function BrandRow({
  brand,
  canManage,
}: {
  brand: BrandDto;
  canManage: boolean;
}) {
  const [state, dispatch, pending] = useActionState(updateBrand, IDLE);
  return (
    <ListRow
      name={brand.name}
      meta={count(brand.itemCount)}
      active={brand.active}
      canManage={canManage}
      pending={pending}
      error={state.error}
      onSave={(changes) =>
        startTransition(() =>
          dispatch({
            id: brand.id,
            input: {
              name: changes.name ?? brand.name,
              active: changes.active ?? brand.active,
            },
          }),
        )
      }
    />
  );
}

export function BrandList({
  brands,
  canManage,
}: {
  brands: BrandDto[];
  canManage: boolean;
}) {
  if (brands.length === 0) {
    return <Empty title="No brands yet" />;
  }
  return (
    <Stack gap="xs">
      {brands.map((b) => (
        <BrandRow
          key={`${b.id}:${b.name}:${b.active}`}
          brand={b}
          canManage={canManage}
        />
      ))}
    </Stack>
  );
}

type BrandOption = { value: string; label: string };

export function AddModelForm({ brands }: { brands: BrandOption[] }) {
  const [state, action, pending] = useActionState(createMachineModel, IDLE);
  return (
    <form action={action}>
      <Stack gap="xs">
        <StateAlert state={state} />
        <Group align="flex-end" gap="sm" wrap="wrap">
          <TextInput
            key={state.message}
            name="name"
            label="New machine model"
            placeholder="Model name"
            required
            maxLength={80}
            error={fieldError(state, 'name')}
            style={{ flex: '1 1 200px' }}
            size="md"
          />
          <Select
            name="brandId"
            label="Brand"
            placeholder="Any brand"
            data={brands}
            searchable
            clearable
            style={{ flex: '1 1 180px' }}
            size="md"
          />
          <Button type="submit" loading={pending} size="md">
            Add model
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

function ModelRow({
  model,
  brands,
  canManage,
}: {
  model: MachineModelDto;
  brands: BrandOption[];
  canManage: boolean;
}) {
  const [state, dispatch, pending] = useActionState(updateMachineModel, IDLE);
  const brand = model.brand;
  const options =
    brand && !brands.some((b) => b.value === brand.id)
      ? [...brands, { value: brand.id, label: brand.name }]
      : brands;
  const save = (changes: {
    name?: string;
    active?: boolean;
    brandId?: string | null;
  }) =>
    startTransition(() =>
      dispatch({
        id: model.id,
        input: {
          name: changes.name ?? model.name,
          active: changes.active ?? model.active,
          brandId:
            changes.brandId === undefined
              ? (model.brand?.id ?? null)
              : changes.brandId,
        },
      }),
    );
  return (
    <ListRow
      name={model.name}
      meta={`${model.brand ? `${model.brand.name} · ` : ''}${count(model.itemCount)}`}
      active={model.active}
      canManage={canManage}
      pending={pending}
      error={state.error}
      onSave={save}
      extra={
        canManage ? (
          <Select
            aria-label="Brand"
            placeholder="Any brand"
            data={options}
            value={model.brand?.id ?? null}
            onChange={(v) => save({ brandId: v })}
            searchable
            clearable
            disabled={pending}
            maw={260}
          />
        ) : null
      }
    />
  );
}

export function ModelList({
  models,
  brands,
  canManage,
}: {
  models: MachineModelDto[];
  brands: BrandOption[];
  canManage: boolean;
}) {
  if (models.length === 0) {
    return <Empty title="No machine models yet" />;
  }
  return (
    <Stack gap="xs">
      {models.map((m) => (
        <ModelRow
          key={`${m.id}:${m.name}:${m.active}:${m.brand?.id ?? ''}`}
          model={m}
          brands={brands}
          canManage={canManage}
        />
      ))}
    </Stack>
  );
}
