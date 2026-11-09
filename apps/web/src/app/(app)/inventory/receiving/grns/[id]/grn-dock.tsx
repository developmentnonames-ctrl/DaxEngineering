'use client';

import {
  ActionIcon,
  Alert,
  Button,
  Group,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import {
  startTransition,
  useActionState,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { GrnDto } from '@dax/inventory-contract';
import { Empty, Icon, Mono, Pill, SectionCard } from '@dax/web-shell';
import { StateAlert } from '../../../../../../components/state-alert';
import { fieldError, IDLE } from '../../../../../../lib/action-state';
import { trimQty } from '../../../../../../lib/format';
import { runGrnStep } from '../../_lib/actions';
import { type GrnSubtype, SUBTYPE_LABELS } from '../../_lib/labels';
import {
  cardTone,
  isQty,
  lineHints,
  qtyNumber,
  qtyText,
  summarize,
} from '../../_lib/lines';
import { PartFinder } from '../../_lib/part-finder';
import { QtyStepper } from '../../_lib/qty-stepper';
import type { PartRef } from '../../_lib/types';
import { PostGrnButton } from './grn-buttons';

interface DockLine {
  key: string;
  id?: string;
  item: PartRef;
  qtyExpected: string;
  qtyGood: string;
  qtyDamaged: string;
  wrongItem: boolean;
  notes: string;
}

function toDockLine(line: GrnDto['lines'][number]): DockLine {
  return {
    key: line.id,
    id: line.id,
    item: line.item,
    qtyExpected: line.qtyExpected ? trimQty(line.qtyExpected) : '',
    qtyGood: trimQty(line.qtyGood),
    qtyDamaged: trimQty(line.qtyDamaged),
    wrongItem: line.wrongItem,
    notes: line.notes ?? '',
  };
}

function LineCard({
  line,
  index,
  flash,
  errors,
  onChange,
  onRemove,
}: {
  line: DockLine;
  index: number;
  flash: boolean;
  errors: (key: string) => string | undefined;
  onChange: (patch: Partial<DockLine>) => void;
  onRemove: () => void;
}) {
  const hints = lineHints(line);
  const bad = (v: string) => (isQty(v) ? undefined : 'Enter a number');
  const noteQty = line.qtyExpected.trim();
  return (
    <div
      id={`line-${line.key}`}
      className="dax-line"
      data-tone={cardTone(hints)}
      data-flash={flash}
    >
      <div className="dax-line-top">
        <div style={{ minWidth: 0 }}>
          <span className="p">
            <Mono>{line.item.partNo}</Mono>
          </span>{' '}
          <span className="dax-muted">{line.item.brand}</span>
          <span className="dax-sub">{line.item.description}</span>
        </div>
        <ActionIcon
          size="lg"
          variant="subtle"
          color="red"
          aria-label={`Remove ${line.item.partNo}`}
          onClick={onRemove}
        >
          <Icon name="close" size={20} />
        </ActionIcon>
      </div>
      <TextInput
        size="md"
        label={`Qty on delivery note (${line.item.uom})`}
        description="Optional. Fill it in to see short or extra."
        inputMode="decimal"
        autoComplete="off"
        maxLength={15}
        value={line.qtyExpected}
        error={
          noteQty && !isQty(noteQty)
            ? 'Enter a number'
            : errors(`lines.${index}.qtyExpected`)
        }
        onChange={(e) =>
          onChange({ qtyExpected: e.currentTarget.value.replace(',', '.') })
        }
        style={{ maxWidth: 260 }}
      />
      <div className="dax-steppers">
        <QtyStepper
          label="Good"
          unit={line.item.uom}
          value={line.qtyGood}
          error={bad(line.qtyGood) ?? errors(`lines.${index}.qtyGood`)}
          onChange={(qtyGood) => onChange({ qtyGood })}
        />
        <QtyStepper
          label="Damaged"
          unit={line.item.uom}
          value={line.qtyDamaged}
          error={bad(line.qtyDamaged) ?? errors(`lines.${index}.qtyDamaged`)}
          onChange={(qtyDamaged) => onChange({ qtyDamaged })}
        />
      </div>
      <Switch
        size="md"
        label="Wrong item (not what was ordered)"
        checked={line.wrongItem}
        onChange={(e) => onChange({ wrongItem: e.currentTarget.checked })}
      />
      <TextInput
        size="md"
        placeholder="Notes, e.g. box crushed, label missing"
        aria-label={`Notes for ${line.item.partNo}`}
        maxLength={300}
        value={line.notes}
        error={errors(`lines.${index}.notes`)}
        onChange={(e) => onChange({ notes: e.currentTarget.value })}
      />
      {hints.length ? (
        <div className="dax-chips" style={{ gap: 6 }}>
          {hints.map((h) => (
            <Pill key={h.label} tone={h.tone}>
              {h.label}
            </Pill>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function GrnDock({ grn, canPost }: { grn: GrnDto; canPost: boolean }) {
  const [state, dispatch, pending] = useActionState(runGrnStep, IDLE);
  const [subtype, setSubtype] = useState<GrnSubtype>(grn.subtype);
  const [deliveryNote, setDeliveryNote] = useState(grn.deliveryNote ?? '');
  const [deliveryDate, setDeliveryDate] = useState(
    grn.deliveryDate?.slice(0, 10) ?? '',
  );
  const [notes, setNotes] = useState(grn.notes ?? '');
  const [lines, setLines] = useState<DockLine[]>(() =>
    grn.lines.map(toDockLine),
  );
  const [flash, setFlash] = useState<string | null>(null);
  const err = (key: string) => fieldError(state, key);

  const update = useMemo(
    () => ({
      subtype,
      deliveryNote,
      deliveryDate: deliveryDate || null,
      notes,
      lines: lines.map((l) => ({
        id: l.id,
        itemId: l.item.id,
        qtyExpected: l.qtyExpected.trim() || null,
        qtyGood: l.qtyGood.trim(),
        qtyDamaged: l.qtyDamaged.trim(),
        wrongItem: l.wrongItem,
        notes: l.notes,
      })),
    }),
    [subtype, deliveryNote, deliveryDate, notes, lines],
  );
  const [saved] = useState(() => JSON.stringify(update));
  const dirty = JSON.stringify(update) !== saved;
  const invalid = lines.some(
    (l) =>
      !isQty(l.qtyGood) ||
      !isQty(l.qtyDamaged) ||
      (l.qtyExpected.trim() !== '' && !isQty(l.qtyExpected)),
  );
  const summary = summarize(lines);

  useEffect(() => {
    if (!flash) return;
    document
      .getElementById(`line-${flash}`)
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const timer = window.setTimeout(() => setFlash(null), 1400);
    return () => window.clearTimeout(timer);
  }, [flash]);

  function patchLine(key: string, patch: Partial<DockLine>) {
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, ...patch } : l)),
    );
  }

  function addPart(part: PartRef): string {
    const existing = lines.find((l) => l.item.id === part.id && !l.wrongItem);
    if (existing) {
      patchLine(existing.key, {
        qtyGood: qtyText(qtyNumber(existing.qtyGood) + 1),
      });
      setFlash(existing.key);
      return `One more good ${part.partNo}.`;
    }
    const key = `new-${part.id}-${Date.now()}`;
    setLines((prev) => [
      ...prev,
      {
        key,
        item: part,
        qtyExpected: '',
        qtyGood: '1',
        qtyDamaged: '0',
        wrongItem: false,
        notes: '',
      },
    ]);
    setFlash(key);
    return `Added ${part.partNo}.`;
  }

  function run(step: 'save' | 'check') {
    startTransition(() =>
      dispatch({
        id: grn.id,
        version: grn.version,
        step,
        update: dirty ? update : undefined,
      }),
    );
  }

  const checked = grn.status === 'CHECKED' && !dirty;

  return (
    <Stack gap="lg">
      <SectionCard title="Delivery">
        <Stack>
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <TextInput
              label="Supplier"
              value={grn.supplier.name}
              readOnly
              size="md"
            />
            <Stack gap={4}>
              <Text size="sm" fw={500}>
                GRN type
              </Text>
              <SegmentedControl
                fullWidth
                size="md"
                value={subtype}
                onChange={(v) => setSubtype(v === 'LOC' ? 'LOC' : 'FOR')}
                data={[
                  { value: 'FOR', label: SUBTYPE_LABELS.FOR },
                  { value: 'LOC', label: SUBTYPE_LABELS.LOC },
                ]}
              />
              <Text size="xs" c="dimmed">
                Set from the supplier. Change it if this delivery is different.
              </Text>
            </Stack>
            <TextInput
              label="Delivery note number"
              maxLength={60}
              value={deliveryNote}
              onChange={(e) => setDeliveryNote(e.currentTarget.value)}
              error={err('deliveryNote')}
              size="md"
            />
            <TextInput
              type="date"
              label="Date on the delivery note"
              description="For information. Stock is received on the day it is posted."
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.currentTarget.value)}
              error={err('deliveryDate')}
              size="md"
            />
          </SimpleGrid>
          <Textarea
            label="Notes"
            autosize
            minRows={1}
            maxLength={1000}
            value={notes}
            onChange={(e) => setNotes(e.currentTarget.value)}
            error={err('notes')}
            size="md"
          />
        </Stack>
      </SectionCard>

      <SectionCard
        title="Count each part"
        note="Good goes to the receiving bin · damaged to quarantine"
      >
        <Stack gap="md">
          {lines.length === 0 ? (
            <Empty title="No lines yet">
              Scan each part as you unpack it, or search for it.
            </Empty>
          ) : (
            lines.map((line, i) => (
              <LineCard
                key={line.key}
                line={line}
                index={i}
                flash={flash === line.key}
                errors={err}
                onChange={(patch) => patchLine(line.key, patch)}
                onRemove={() =>
                  setLines((prev) => prev.filter((l) => l.key !== line.key))
                }
              />
            ))
          )}
          <Group>
            <PartFinder
              onPick={addPart}
              scanHint="Keep scanning. Each scan of a listed part adds one good."
            />
          </Group>
        </Stack>
      </SectionCard>

      {state.error || state.ok ? <StateAlert state={state} /> : null}
      {grn.status === 'CHECKED' && dirty ? (
        <Alert color="yellow">
          Saving changes sends this GRN back to draft. Mark it checked again
          before posting.
        </Alert>
      ) : null}

      <div className="dax-bar">
        <span className="note">
          {dirty
            ? 'Unsaved changes'
            : `${lines.length} ${lines.length === 1 ? 'line' : 'lines'} · ${summary.flagged} to flag`}
        </span>
        {dirty ? (
          <Button
            size="lg"
            variant="default"
            loading={pending}
            disabled={invalid}
            onClick={() => run('save')}
          >
            Save
          </Button>
        ) : null}
        {!checked ? (
          <Button
            size="lg"
            loading={pending}
            disabled={invalid || lines.length === 0}
            onClick={() => run('check')}
          >
            Mark checked
          </Button>
        ) : null}
        {checked && canPost ? (
          <PostGrnButton id={grn.id} version={grn.version} summary={summary} />
        ) : null}
      </div>
    </Stack>
  );
}
