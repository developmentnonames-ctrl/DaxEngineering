'use client';

import {
  Badge,
  Button,
  Group,
  Paper,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { startTransition, useActionState, useState } from 'react';
import type { DepartmentDto } from '@dax/platform-contract';
import { StateAlert } from '../../../components/state-alert';
import { fieldError, IDLE } from '../../../lib/action-state';
import { createDepartment, updateDepartment } from './actions';

export function AddDepartmentForm() {
  const [state, action, pending] = useActionState(createDepartment, IDLE);
  return (
    <Paper withBorder p="md">
      <form action={action}>
        <Stack gap="sm">
          <StateAlert state={state} />
          <Group align="flex-end">
            <TextInput
              name="name"
              label="New department"
              placeholder="Department name"
              required
              maxLength={60}
              error={fieldError(state, 'name')}
              style={{ flex: 1, minWidth: 200 }}
            />
            <Button type="submit" loading={pending}>
              Add department
            </Button>
          </Group>
        </Stack>
      </form>
    </Paper>
  );
}

function DepartmentRow({
  department,
  canManage,
}: {
  department: DepartmentDto;
  canManage: boolean;
}) {
  const [state, dispatch, pending] = useActionState(updateDepartment, IDLE);
  const [name, setName] = useState(department.name);
  const renamed = name.trim() !== department.name;

  const save = (input: { name: string; active: boolean }) =>
    startTransition(() => dispatch({ id: department.id, input }));

  return (
    <Table.Tr>
      <Table.Td>
        {canManage ? (
          <Stack gap={4}>
            <Group gap="xs" wrap="nowrap">
              <TextInput
                aria-label="Department name"
                value={name}
                onChange={(e) => setName(e.currentTarget.value)}
                maxLength={60}
                error={
                  fieldError(state, 'input.name') ?? fieldError(state, 'name')
                }
                disabled={pending}
                style={{ flex: 1, minWidth: 160 }}
              />
              {renamed ? (
                <Button
                  size="xs"
                  loading={pending}
                  onClick={() => save({ name, active: department.active })}
                >
                  Rename
                </Button>
              ) : null}
            </Group>
            {state.error ? (
              <Text size="xs" c="red">
                {state.error}
              </Text>
            ) : null}
          </Stack>
        ) : (
          department.name
        )}
      </Table.Td>
      <Table.Td>{department.memberCount}</Table.Td>
      <Table.Td>
        {canManage ? (
          <Switch
            aria-label="Active"
            checked={department.active}
            disabled={pending}
            label={department.active ? 'Active' : 'Off'}
            onChange={(e) =>
              save({ name: department.name, active: e.currentTarget.checked })
            }
          />
        ) : (
          <Badge color={department.active ? 'green' : 'gray'}>
            {department.active ? 'Active' : 'Off'}
          </Badge>
        )}
      </Table.Td>
    </Table.Tr>
  );
}

export function DepartmentsTable({
  departments,
  canManage,
}: {
  departments: DepartmentDto[];
  canManage: boolean;
}) {
  return (
    <Table.ScrollContainer minWidth={420}>
      <Table striped withTableBorder verticalSpacing="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Name</Table.Th>
            <Table.Th>Members</Table.Th>
            <Table.Th>Status</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {departments.map((d) => (
            <DepartmentRow
              key={`${d.id}:${d.name}`}
              department={d}
              canManage={canManage}
            />
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
