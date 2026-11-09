'use client';

import {
  Accordion,
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import type { Dispatch, SetStateAction } from 'react';
import {
  type CatalogEntity,
  type CatalogField,
  tierDefault,
} from '../../../../lib/catalog';
import { TIER_COLORS, TIER_LABELS } from '../../../../lib/format';
import {
  type FieldAccess,
  type FieldState,
  isChanged,
  normalizeAccess,
} from '../grants';

type Tier = CatalogField['tier'];

function FieldRow({
  field,
  access,
  readOnly,
  onChange,
}: {
  field: CatalogField;
  access: FieldAccess;
  readOnly: boolean;
  onChange: (access: FieldAccess) => void;
}) {
  const value = normalizeAccess(field, access);
  const changed = isChanged(field, access);
  return (
    <Table.Tr>
      <Table.Td>
        <Text size="sm" fw={500}>
          {field.label}
        </Text>
        <Group gap={4}>
          {field.locked ? (
            <Text size="xs" c="dimmed">
              Always visible
            </Text>
          ) : null}
          {field.encrypted ? (
            <Text size="xs" c="dimmed">
              Encrypted
            </Text>
          ) : null}
        </Group>
      </Table.Td>
      <Table.Td>
        <Text size="sm" c="dimmed">
          {field.group ?? '—'}
        </Text>
      </Table.Td>
      <Table.Td>
        <Badge color={TIER_COLORS[field.tier]} variant="light">
          {TIER_LABELS[field.tier]}
        </Badge>
      </Table.Td>
      <Table.Td>
        <Checkbox
          aria-label={`Read ${field.label}`}
          checked={value.read}
          disabled={readOnly || field.locked}
          onChange={(e) => {
            const read = e.currentTarget.checked;
            onChange({ read, write: read && value.write });
          }}
        />
      </Table.Td>
      <Table.Td>
        <Checkbox
          aria-label={`Write ${field.label}`}
          checked={value.write}
          disabled={readOnly || !field.writable}
          onChange={(e) => {
            const write = e.currentTarget.checked;
            onChange({ read: write || value.read, write });
          }}
        />
      </Table.Td>
      <Table.Td>
        {changed ? (
          <Group gap={4} wrap="nowrap">
            <Badge color="blue" variant="light">
              Changed
            </Badge>
            {readOnly ? null : (
              <Button
                size="compact-xs"
                variant="subtle"
                onClick={() => onChange(tierDefault(field))}
              >
                Reset to default
              </Button>
            )}
          </Group>
        ) : (
          <Text size="xs" c="dimmed">
            Default
          </Text>
        )}
      </Table.Td>
    </Table.Tr>
  );
}

export function FieldGrid({
  entities,
  fields,
  setFields,
  readOnly,
}: {
  entities: readonly CatalogEntity[];
  fields: FieldState;
  setFields: Dispatch<SetStateAction<FieldState>>;
  readOnly: boolean;
}) {
  const setOne = (fieldId: string, access: FieldAccess) =>
    setFields((prev) => ({ ...prev, [fieldId]: access }));

  const applyToEntity = (
    entity: CatalogEntity,
    change: (field: CatalogField, current: FieldAccess) => FieldAccess,
  ) =>
    setFields((prev) => {
      const next = { ...prev };
      for (const field of entity.fields) {
        next[field.id] = change(field, prev[field.id] ?? tierDefault(field));
      }
      return next;
    });

  const allowReadOn = (entity: CatalogEntity, tier: Tier) =>
    applyToEntity(entity, (field, current) =>
      field.tier === tier ? { ...current, read: true } : current,
    );

  return (
    <Stack>
      <Title order={3}>Field access</Title>
      <Alert color="blue" variant="light">
        <Text size="sm">
          Default: Internal fields are visible, Confidential and Restricted
          fields are hidden. Only changes from the default are saved.
        </Text>
        <Text size="sm" mt={4}>
          A user with several roles sees a field if any of their roles can see
          it. Write access always includes read access.
        </Text>
      </Alert>
      {entities.length === 0 ? (
        <Text c="dimmed">No fields to manage yet.</Text>
      ) : (
        <Accordion multiple variant="separated">
          {entities.map((entity) => {
            const changedCount = entity.fields.filter((f) =>
              isChanged(f, fields[f.id] ?? tierDefault(f)),
            ).length;
            return (
              <Accordion.Item key={entity.key} value={entity.key}>
                <Accordion.Control>
                  <Group gap="xs">
                    <Text fw={500}>{entity.label}</Text>
                    {changedCount ? (
                      <Badge color="blue" variant="light">
                        {changedCount} changed
                      </Badge>
                    ) : null}
                  </Group>
                </Accordion.Control>
                <Accordion.Panel>
                  <Stack gap="xs">
                    {readOnly ? null : (
                      <Group gap="xs">
                        <Button
                          size="xs"
                          variant="light"
                          onClick={() => allowReadOn(entity, 'CONFIDENTIAL')}
                        >
                          Show all Confidential
                        </Button>
                        <Button
                          size="xs"
                          variant="light"
                          onClick={() => allowReadOn(entity, 'RESTRICTED')}
                        >
                          Show all Restricted
                        </Button>
                        <Button
                          size="xs"
                          variant="default"
                          onClick={() =>
                            applyToEntity(entity, (field) => tierDefault(field))
                          }
                        >
                          Reset all to default
                        </Button>
                      </Group>
                    )}
                    <Table.ScrollContainer minWidth={640}>
                      <Table verticalSpacing="xs">
                        <Table.Thead>
                          <Table.Tr>
                            <Table.Th>Field</Table.Th>
                            <Table.Th>Group</Table.Th>
                            <Table.Th>Tier</Table.Th>
                            <Table.Th>Read</Table.Th>
                            <Table.Th>Write</Table.Th>
                            <Table.Th />
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {entity.fields.map((field) => (
                            <FieldRow
                              key={field.id}
                              field={field}
                              access={fields[field.id] ?? tierDefault(field)}
                              readOnly={readOnly}
                              onChange={(access) => setOne(field.id, access)}
                            />
                          ))}
                        </Table.Tbody>
                      </Table>
                    </Table.ScrollContainer>
                  </Stack>
                </Accordion.Panel>
              </Accordion.Item>
            );
          })}
        </Accordion>
      )}
    </Stack>
  );
}
