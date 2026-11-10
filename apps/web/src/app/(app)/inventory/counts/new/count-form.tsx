'use client';

import {
  Alert,
  Button,
  Checkbox,
  Group,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Textarea,
} from '@mantine/core';
import { startTransition, useActionState, useMemo, useState } from 'react';
import type { CountScope, CountScopeBin } from '@dax/inventory-contract';
import { Empty, Mono } from '@dax/web-shell';
import { StateAlert } from '../../../../../components/state-alert';
import { IDLE } from '../../../../../lib/action-state';
import { createCount } from '../_lib/actions';
import { COUNT_KIND_OPTIONS, type CountKind } from '../_lib/labels';

type Zone = CountScope['zones'][number];

const KIND_HELP: Record<CountKind, string> = {
  CYCLE: 'Count a few zones or bins. Use it for regular checks.',
  FULL: 'Count every active storage and quarantine bin in the store.',
  OPENING:
    'Record the starting stock of bins. Each bin has one opening count, so bins already opened are left out.',
};

function binNote(bin: CountScopeBin, kind: CountKind): string {
  if (bin.countNumber) return `In ${bin.countNumber}`;
  if (kind === 'OPENING' && bin.opened) return 'Already opened';
  const parts = `${bin.itemCount} ${bin.itemCount === 1 ? 'part' : 'parts'}`;
  return bin.kind === 'QUARANTINE' ? `Quarantine · ${parts}` : parts;
}

export function CountForm({ zones }: { zones: Zone[] }) {
  const [kind, setKind] = useState<CountKind>('CYCLE');
  const [blind, setBlind] = useState(false);
  const [notes, setNotes] = useState('');
  const [wholeZones, setWholeZones] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [state, dispatch, pending] = useActionState(createCount, IDLE);

  const available = (bin: CountScopeBin) =>
    !bin.countNumber && !(kind === 'OPENING' && bin.opened);

  const chosen = useMemo(() => {
    const all = zones.flatMap((z) => z.bins);
    if (kind === 'FULL') return all.filter((b) => !b.countNumber);
    return zones.flatMap((z) =>
      z.bins.filter(
        (b) =>
          !b.countNumber &&
          !(kind === 'OPENING' && b.opened) &&
          (wholeZones.has(z.id) || picked.has(b.id)),
      ),
    );
  }, [zones, kind, wholeZones, picked]);

  const busyBins = zones.flatMap((z) => z.bins).filter((b) => b.countNumber);

  function toggle(set: Set<string>, id: string, on: boolean) {
    const next = new Set(set);
    if (on) next.add(id);
    else next.delete(id);
    return next;
  }

  function start() {
    startTransition(() =>
      dispatch({
        kind,
        blind,
        notes,
        zoneIds: [],
        binIds: kind === 'FULL' ? [] : chosen.map((b) => b.id),
      }),
    );
  }

  if (zones.length === 0)
    return (
      <Empty title="No bins to count">
        Set up zones and storage bins first.
      </Empty>
    );

  return (
    <Stack gap="lg">
      <div>
        <SegmentedControl
          fullWidth
          size="md"
          value={kind}
          onChange={(v) =>
            setKind(
              v === 'FULL' ? 'FULL' : v === 'OPENING' ? 'OPENING' : 'CYCLE',
            )
          }
          data={COUNT_KIND_OPTIONS}
        />
        <Text size="sm" c="dimmed" mt="xs">
          {KIND_HELP[kind]}
        </Text>
      </div>

      <Switch
        size="md"
        checked={blind}
        onChange={(e) => setBlind(e.currentTarget.checked)}
        label="Blind count"
        description="Counters don't see the system quantities while they count. The Stores Manager still does."
      />

      {kind === 'FULL' ? (
        <Alert color={busyBins.length ? 'orange' : 'blue'}>
          {busyBins.length
            ? `${busyBins.length} ${busyBins.length === 1 ? 'bin is' : 'bins are'} already in another count. Post or cancel that count before starting a full count.`
            : `All ${chosen.length} storage and quarantine bins will be counted.`}
        </Alert>
      ) : (
        <Stack gap="sm">
          <Text fw={600}>Zones and bins</Text>
          {zones.map((zone) => {
            const open = zone.bins.filter(available);
            const whole = wholeZones.has(zone.id);
            return (
              <div key={zone.id} className="dax-line">
                <Group justify="space-between" wrap="nowrap" gap="sm">
                  <Checkbox
                    size="md"
                    checked={whole}
                    disabled={open.length === 0}
                    onChange={(e) =>
                      setWholeZones((s) =>
                        toggle(s, zone.id, e.currentTarget.checked),
                      )
                    }
                    label={
                      <>
                        Whole zone <Mono>{zone.code}</Mono> · {zone.name}
                      </>
                    }
                    description={`${open.length} of ${zone.bins.length} ${zone.bins.length === 1 ? 'bin' : 'bins'} can be counted`}
                  />
                  <Button
                    variant="subtle"
                    onClick={() =>
                      setExpanded((s) =>
                        toggle(s, zone.id, !expanded.has(zone.id)),
                      )
                    }
                  >
                    {expanded.has(zone.id) ? 'Hide bins' : 'Choose bins'}
                  </Button>
                </Group>
                {expanded.has(zone.id) ? (
                  <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }} mt="sm">
                    {zone.bins.map((bin) => (
                      <Checkbox
                        key={bin.id}
                        checked={
                          available(bin) && (whole || picked.has(bin.id))
                        }
                        disabled={!available(bin) || whole}
                        onChange={(e) =>
                          setPicked((s) =>
                            toggle(s, bin.id, e.currentTarget.checked),
                          )
                        }
                        label={<Mono>{bin.code}</Mono>}
                        description={binNote(bin, kind)}
                      />
                    ))}
                  </SimpleGrid>
                ) : null}
              </div>
            );
          })}
        </Stack>
      )}

      <Textarea
        label="Notes"
        description="Optional"
        autosize
        minRows={2}
        maxLength={1000}
        value={notes}
        onChange={(e) => setNotes(e.currentTarget.value)}
      />

      <StateAlert state={state} />
      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          {chosen.length} {chosen.length === 1 ? 'bin' : 'bins'} will be frozen
          for counting.
        </Text>
        <Button
          size="md"
          loading={pending}
          disabled={
            chosen.length === 0 || (kind === 'FULL' && busyBins.length > 0)
          }
          onClick={start}
        >
          Start counting
        </Button>
      </Group>
    </Stack>
  );
}
