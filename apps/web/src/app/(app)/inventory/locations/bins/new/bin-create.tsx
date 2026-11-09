'use client';

import {
  Alert,
  Button,
  Group,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useActionState, useState } from 'react';
import { BIN_PART, binCode, type ZoneDto } from '@dax/inventory-contract';
import { StateAlert } from '../../../../../../components/state-alert';
import { fieldError, IDLE } from '../../../../../../lib/action-state';
import { BIN_KIND_OPTIONS } from '../../../../../../lib/format';
import { createBin, createBins } from '../../actions';

const MAX_BULK = 500;

type ZoneOption = Pick<ZoneDto, 'id' | 'code' | 'name'>;

function ZoneSelect({
  zones,
  value,
  onChange,
  error,
}: {
  zones: ZoneOption[];
  value: string | null;
  onChange: (v: string | null) => void;
  error?: string;
}) {
  return (
    <Select
      name="zoneId"
      label="Zone"
      required
      data={zones.map((z) => ({ value: z.id, label: `${z.code} · ${z.name}` }))}
      value={value}
      onChange={onChange}
      allowDeselect={false}
      error={error}
      size="md"
    />
  );
}

function KindSelect() {
  return (
    <Select
      name="kind"
      label="Kind"
      data={BIN_KIND_OPTIONS}
      defaultValue="STORAGE"
      allowDeselect={false}
      size="md"
    />
  );
}

function SingleBin({ zones }: { zones: ZoneOption[] }) {
  const [state, action, pending] = useActionState(createBin, IDLE);
  const [zoneId, setZoneId] = useState<string | null>(zones[0]?.id ?? null);
  const [rack, setRack] = useState('');
  const [shelf, setShelf] = useState('');
  const [position, setPosition] = useState('');
  const zone = zones.find((z) => z.id === zoneId);
  const err = (key: string) => fieldError(state, key);
  const complete =
    zone &&
    BIN_PART.rack.test(rack) &&
    BIN_PART.shelf.test(shelf) &&
    BIN_PART.position.test(position.toUpperCase());

  return (
    <form action={action}>
      <Stack>
        <StateAlert state={state} />
        <ZoneSelect
          zones={zones}
          value={zoneId}
          onChange={setZoneId}
          error={err('zoneId')}
        />
        <SimpleGrid cols={3} spacing="sm">
          <TextInput
            name="rack"
            label="Rack"
            placeholder="1"
            inputMode="numeric"
            required
            maxLength={3}
            value={rack}
            onChange={(e) => setRack(e.currentTarget.value.trim())}
            error={err('rack')}
            size="md"
          />
          <TextInput
            name="shelf"
            label="Shelf"
            placeholder="2"
            inputMode="numeric"
            required
            maxLength={2}
            value={shelf}
            onChange={(e) => setShelf(e.currentTarget.value.trim())}
            error={err('shelf')}
            size="md"
          />
          <TextInput
            name="position"
            label="Position"
            placeholder="B"
            required
            maxLength={3}
            autoCapitalize="characters"
            value={position}
            onChange={(e) =>
              setPosition(e.currentTarget.value.trim().toUpperCase())
            }
            error={err('position')}
            size="md"
          />
        </SimpleGrid>
        <Text size="sm">
          Bin code:{' '}
          {complete ? (
            <span className="dax-pill int" style={{ fontSize: 15 }}>
              <span className="dax-mono">
                {binCode({ zone: zone.code, rack, shelf, position })}
              </span>
            </span>
          ) : (
            <Text span c="dimmed">
              fill in rack, shelf and position
            </Text>
          )}
        </Text>
        <KindSelect />
        <Textarea
          name="notes"
          label="Notes"
          autosize
          minRows={2}
          maxLength={300}
          size="md"
        />
        <Group>
          <Button
            type="submit"
            loading={pending}
            size="md"
            disabled={!complete}
          >
            Add bin
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

function span(from: number | string, to: number | string): number {
  const a = Number(from);
  const b = Number(to);
  return Number.isInteger(a) && Number.isInteger(b) && a > 0 && b >= a
    ? b - a + 1
    : 0;
}

function parsePositions(value: string): string[] {
  return value
    .split(/[,\s]+/)
    .map((p) => p.trim().toUpperCase())
    .filter(Boolean);
}

function BulkBins({ zones }: { zones: ZoneOption[] }) {
  const [state, action, pending] = useActionState(createBins, IDLE);
  const [zoneId, setZoneId] = useState<string | null>(zones[0]?.id ?? null);
  const [rackFrom, setRackFrom] = useState<number | string>(1);
  const [rackTo, setRackTo] = useState<number | string>(1);
  const [shelfFrom, setShelfFrom] = useState<number | string>(1);
  const [shelfTo, setShelfTo] = useState<number | string>(4);
  const [positions, setPositions] = useState('A,B,C,D');
  const zone = zones.find((z) => z.id === zoneId);
  const list = parsePositions(positions);
  const badPosition = list.find((p) => !BIN_PART.position.test(p));
  const count = span(rackFrom, rackTo) * span(shelfFrom, shelfTo) * list.length;
  const sample = (
    r: number | string,
    s: number | string,
    p: string | undefined,
  ) =>
    zone && p
      ? binCode({
          zone: zone.code,
          rack: String(r),
          shelf: String(s),
          position: p,
        })
      : '';
  const ok = Boolean(zone) && count > 0 && count <= MAX_BULK && !badPosition;

  return (
    <form action={action}>
      <input type="hidden" name="positions" value={list.join(',')} />
      <Stack>
        <StateAlert state={state} />
        <ZoneSelect
          zones={zones}
          value={zoneId}
          onChange={setZoneId}
          error={fieldError(state, 'zoneId')}
        />
        <SimpleGrid cols={2} spacing="sm">
          <NumberInput
            name="rackFrom"
            label="Racks from"
            min={1}
            max={999}
            allowDecimal={false}
            value={rackFrom}
            onChange={setRackFrom}
            size="md"
          />
          <NumberInput
            name="rackTo"
            label="Racks to"
            min={1}
            max={999}
            allowDecimal={false}
            value={rackTo}
            onChange={setRackTo}
            size="md"
          />
          <NumberInput
            name="shelfFrom"
            label="Shelves from"
            min={1}
            max={99}
            allowDecimal={false}
            value={shelfFrom}
            onChange={setShelfFrom}
            size="md"
          />
          <NumberInput
            name="shelfTo"
            label="Shelves to"
            min={1}
            max={99}
            allowDecimal={false}
            value={shelfTo}
            onChange={setShelfTo}
            size="md"
          />
        </SimpleGrid>
        <TextInput
          label="Positions on each shelf"
          description="Separate with commas, for example A,B,C,D"
          value={positions}
          onChange={(e) => setPositions(e.currentTarget.value.toUpperCase())}
          error={
            badPosition
              ? `"${badPosition}" is not a valid position`
              : fieldError(state, 'positions')
          }
          size="md"
        />
        <KindSelect />
        {count > MAX_BULK ? (
          <Alert color="orange">
            That makes {count} bins. Add at most {MAX_BULK} at a time.
          </Alert>
        ) : count > 0 && zone ? (
          <Text size="sm">
            Creates <b>{count}</b> {count === 1 ? 'bin' : 'bins'}:{' '}
            <span className="dax-mono">
              {sample(rackFrom, shelfFrom, list[0])}
            </span>
            {count > 1 ? (
              <>
                {' '}
                to{' '}
                <span className="dax-mono">
                  {sample(rackTo, shelfTo, list[list.length - 1])}
                </span>
              </>
            ) : null}
            . Bins that already exist are skipped.
          </Text>
        ) : (
          <Text size="sm" c="dimmed">
            Check the ranges: &quot;from&quot; must not be after &quot;to&quot;.
          </Text>
        )}
        <Group>
          <Button type="submit" loading={pending} size="md" disabled={!ok}>
            Add {count > 0 && count <= MAX_BULK ? count : ''} bins
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

export function BinCreate({ zones }: { zones: ZoneOption[] }) {
  return (
    <Tabs defaultValue="single" keepMounted={false}>
      <Tabs.List grow>
        <Tabs.Tab value="single">One bin</Tabs.Tab>
        <Tabs.Tab value="bulk">Many bins</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="single" pt="md">
        <SingleBin zones={zones} />
      </Tabs.Panel>
      <Tabs.Panel value="bulk" pt="md">
        <BulkBins zones={zones} />
      </Tabs.Panel>
    </Tabs>
  );
}
