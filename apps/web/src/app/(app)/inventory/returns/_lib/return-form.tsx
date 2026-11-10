'use client';

import {
  ActionIcon,
  Button,
  Group,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { startTransition, useActionState, useRef, useState } from 'react';
import type { ReturnableAod, ReturnDto } from '@dax/inventory-contract';
import { Empty, Icon, Mono } from '@dax/web-shell';
import { StateAlert } from '../../../../../components/state-alert';
import { fieldError, IDLE } from '../../../../../lib/action-state';
import { formatQty, trimQty } from '../../../../../lib/format';
import { CustomerPicker } from '../../issuing/_lib/header-fields';
import { RemotePicker } from '../../_lib/pickers';
import type { PickerOption } from '../../_lib/search-actions';
import { qtyNumber, qtyText, round3 } from '../../receiving/_lib/lines';
import { PartFinder } from '../../receiving/_lib/part-finder';
import { QtyStepper } from '../../receiving/_lib/qty-stepper';
import type { BinRef, PartRef } from '../../receiving/_lib/types';
import { saveReturn, searchStorageBins, usualBinOf } from './actions';
import { CONDITION_OPTIONS, type ReturnCondition } from './labels';

interface Row {
  key: string;
  aodLineId: string | null;
  part: PartRef;
  qty: string;
  condition: ReturnCondition;
  bin: BinRef | null;
  serialNo: string;
  notes: string;
}

export type ReturnMode =
  | { kind: 'aod'; aod: ReturnableAod }
  | { kind: 'free'; departments: { id: string; name: string }[] };

type Err = (key: string) => string | undefined;

const asCondition = (v: string): ReturnCondition =>
  v === 'DAMAGED' ? 'DAMAGED' : v === 'FAULTY' ? 'FAULTY' : 'GOOD';

function BinChooser({
  onChoose,
  error,
}: {
  onChoose: (bin: BinRef) => void;
  error?: string;
}) {
  const labels = useRef(new Map<string, string>());
  async function search(q: string): Promise<PickerOption[]> {
    const found = await searchStorageBins(q);
    for (const o of found) labels.current.set(o.value, o.label);
    return found;
  }
  return (
    <RemotePicker
      label="Back to bin"
      required
      search={search}
      initial={null}
      value={null}
      onChange={(value) => {
        const code = value ? labels.current.get(value) : undefined;
        if (value && code) onChoose({ id: value, code });
      }}
      placeholder="Type a bin code"
      error={error}
      size="md"
    />
  );
}

function RowEditor({
  row,
  index,
  max,
  usualBinId,
  err,
  patch,
}: {
  row: Row;
  index: number;
  max?: number;
  usualBinId: string | null;
  err: Err;
  patch: (change: Partial<Row>) => void;
}) {
  const field = (name: string) => err(`lines.${index}.${name}`);
  return (
    <Stack gap="sm">
      <div className="dax-steppers">
        <QtyStepper
          label="Quantity"
          unit={row.part.uom}
          value={row.qty}
          max={max}
          error={field('qty')}
          onChange={(qty) => patch({ qty })}
        />
      </div>
      <SegmentedControl
        fullWidth
        size="md"
        value={row.condition}
        onChange={(v) => patch({ condition: asCondition(v) })}
        data={CONDITION_OPTIONS}
        aria-label={`Condition of ${row.part.partNo}`}
      />
      {row.condition === 'GOOD' ? (
        row.bin ? (
          <Group justify="space-between" wrap="nowrap">
            <div>
              <span className="dax-zone" style={{ fontSize: 18 }}>
                {row.bin.code}
              </span>
              {row.bin.id === usualBinId ? (
                <span className="dax-sub">The part&apos;s usual bin.</span>
              ) : null}
            </div>
            <Button variant="default" onClick={() => patch({ bin: null })}>
              Change bin
            </Button>
          </Group>
        ) : (
          <BinChooser
            onChoose={(bin) => patch({ bin })}
            error={field('binId')}
          />
        )
      ) : null}
      {row.condition === 'DAMAGED' ? (
        <Text size="sm" c="dimmed">
          Goes to the quarantine bin. It is not free stock until it is checked.
        </Text>
      ) : null}
      {row.condition === 'FAULTY' ? (
        <>
          <Text size="sm" c="dimmed">
            No stock is added. A warranty tag is made when the return is posted.
          </Text>
          <Textarea
            label="Fault"
            required
            autosize
            minRows={2}
            maxLength={500}
            value={row.notes}
            onChange={(e) => patch({ notes: e.currentTarget.value })}
            error={field('notes')}
            size="md"
          />
          <TextInput
            label="Serial number"
            description="Optional"
            maxLength={60}
            value={row.serialNo}
            onChange={(e) => patch({ serialNo: e.currentTarget.value })}
            error={field('serialNo')}
            size="md"
          />
        </>
      ) : (
        <TextInput
          size="md"
          placeholder="Notes (optional)"
          aria-label={`Notes for ${row.part.partNo}`}
          maxLength={500}
          value={row.notes}
          onChange={(e) => patch({ notes: e.currentTarget.value })}
          error={field('notes')}
        />
      )}
    </Stack>
  );
}

function PartHead({ part }: { part: PartRef }) {
  return (
    <div style={{ minWidth: 0 }}>
      <span className="p">
        <Mono>{part.partNo}</Mono>
      </span>{' '}
      <span className="dax-muted">{part.brand}</span>
      <span className="dax-sub">{part.description}</span>
    </div>
  );
}

function RemoveButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <ActionIcon
      size="lg"
      variant="subtle"
      color="red"
      aria-label={label}
      onClick={onClick}
    >
      <Icon name="close" size={20} />
    </ActionIcon>
  );
}

function rowsFrom(draft: ReturnDto | undefined): Row[] {
  return (
    draft?.lines.map((l) => ({
      key: l.id,
      aodLineId: l.aodLineId,
      part: l.item,
      qty: trimQty(l.qty),
      condition: l.condition,
      bin: l.condition === 'GOOD' ? l.bin : null,
      serialNo: l.serialNo ?? '',
      notes: l.notes ?? '',
    })) ?? []
  );
}

export function ReturnForm({
  mode,
  draft,
  canPost,
}: {
  mode: ReturnMode;
  draft?: ReturnDto;
  canPost: boolean;
}) {
  const [state, dispatch, pending] = useActionState(saveReturn, IDLE);
  const [rows, setRows] = useState<Row[]>(() => rowsFrom(draft));
  const [usualBins, setUsualBins] = useState<Record<string, string | null>>({});
  const departments =
    mode.kind === 'free'
      ? draft && !mode.departments.some((d) => d.id === draft.department.id)
        ? [draft.department, ...mode.departments]
        : mode.departments
      : [];
  const [departmentId, setDepartmentId] = useState<string | null>(
    draft?.department.id ??
      (departments.length === 1 ? (departments[0]?.id ?? null) : null),
  );
  const [customerId, setCustomerId] = useState<string | null>(
    draft?.customer?.id ?? null,
  );
  const [jobNumber, setJobNumber] = useState(draft?.jobNumber ?? '');
  const [reason, setReason] = useState(draft?.reason ?? '');
  const [notes, setNotes] = useState(draft?.notes ?? '');
  const err: Err = (key) => fieldError(state, key);

  const patch = (key: string, change: Partial<Row>) =>
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, ...change } : r)),
    );
  const remove = (key: string) =>
    setRows((prev) => prev.filter((r) => r.key !== key));

  function addFreePart(part: PartRef): string {
    const key = `${part.id}-${Date.now()}`;
    setRows((prev) => [
      ...prev,
      {
        key,
        aodLineId: null,
        part,
        qty: '1',
        condition: 'GOOD',
        bin: null,
        serialNo: '',
        notes: '',
      },
    ]);
    void usualBinOf(part.id).then((bin) => {
      setUsualBins((prev) => ({ ...prev, [part.id]: bin?.id ?? null }));
      if (bin)
        setRows((prev) =>
          prev.map((r) => (r.key === key && !r.bin ? { ...r, bin } : r)),
        );
    });
    return `Added ${part.partNo}.`;
  }

  function send(post: boolean) {
    const lines = rows.map((r) => ({
      aodLineId: r.aodLineId ?? undefined,
      itemId: r.part.id,
      qty: r.qty.trim(),
      condition: r.condition,
      binId: r.condition === 'GOOD' ? (r.bin?.id ?? null) : null,
      serialNo: r.serialNo,
      notes: r.notes,
    }));
    const header =
      mode.kind === 'free'
        ? { departmentId: departmentId ?? '', customerId, jobNumber }
        : draft
          ? {}
          : { aodId: mode.aod.id };
    const body = {
      ...header,
      reason,
      notes,
      lines,
      ...(draft ? { version: draft.version } : {}),
    };
    startTransition(() => dispatch({ id: draft?.id, body, post }));
  }

  const indexed = rows.map((row, index) => ({ row, index }));

  return (
    <Stack gap="lg">
      <StateAlert state={state} />
      {mode.kind === 'free' ? (
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Select
            label="Returning department"
            required
            data={departments.map((d) => ({ value: d.id, label: d.name }))}
            value={departmentId}
            onChange={setDepartmentId}
            allowDeselect={false}
            searchable={departments.length > 8}
            nothingFoundMessage="No departments to choose from"
            comboboxProps={{ withinPortal: true }}
            error={err('departmentId')}
            size="md"
          />
          <CustomerPicker
            initial={
              draft?.customer
                ? { value: draft.customer.id, label: draft.customer.name }
                : null
            }
            value={customerId}
            onChange={setCustomerId}
            error={err('customerId')}
          />
          <TextInput
            label="Job number"
            description="Optional"
            maxLength={40}
            value={jobNumber}
            onChange={(e) => setJobNumber(e.currentTarget.value)}
            error={err('jobNumber')}
            size="md"
          />
        </SimpleGrid>
      ) : null}
      <Textarea
        label="Reason"
        required={mode.kind === 'free'}
        description={
          mode.kind === 'free'
            ? 'Why the parts are coming back without an AOD.'
            : 'Optional'
        }
        autosize
        minRows={2}
        maxLength={300}
        value={reason}
        onChange={(e) => setReason(e.currentTarget.value)}
        error={err('reason')}
        size="md"
      />

      <Stack gap="sm">
        <Group justify="space-between">
          <Text fw={700} size="lg">
            Parts coming back
          </Text>
          <Text c="dimmed" size="sm">
            {rows.length} {rows.length === 1 ? 'line' : 'lines'}
          </Text>
        </Group>

        {mode.kind === 'aod'
          ? mode.aod.lines.map((line) => {
              const mine = indexed.filter(
                (r) => r.row.aodLineId === line.aodLineId,
              );
              const returnable = qtyNumber(line.returnable);
              const taken = round3(
                mine.reduce((sum, r) => sum + qtyNumber(r.row.qty), 0),
              );
              const left = round3(returnable - taken);
              const part: PartRef = line.item;
              return (
                <div key={line.aodLineId} className="dax-line">
                  <div className="dax-line-top">
                    <PartHead part={part} />
                  </div>
                  <span className="dax-sub">
                    Issued {formatQty(line.issued)} · already back{' '}
                    {formatQty(line.returned)} · {formatQty(line.returnable)}{' '}
                    {part.uom} can come back
                  </span>
                  {mine.map(({ row, index }) => (
                    <div key={row.key} className="dax-inset">
                      <Group justify="flex-end">
                        <RemoveButton
                          label={`Remove this ${part.partNo} line`}
                          onClick={() => remove(row.key)}
                        />
                      </Group>
                      <RowEditor
                        row={row}
                        index={index}
                        max={round3(qtyNumber(row.qty) + Math.max(0, left))}
                        usualBinId={line.defaultBin?.id ?? null}
                        err={err}
                        patch={(change) => patch(row.key, change)}
                      />
                    </div>
                  ))}
                  {left > 0 ? (
                    <Group>
                      <Button
                        variant="default"
                        leftSection={<Icon name="plus" size={18} />}
                        onClick={() =>
                          setRows((prev) => [
                            ...prev,
                            {
                              key: `${line.aodLineId}-${Date.now()}`,
                              aodLineId: line.aodLineId,
                              part,
                              qty: qtyText(left),
                              condition: 'GOOD',
                              bin: line.defaultBin ?? line.pickedFrom,
                              serialNo: '',
                              notes: '',
                            },
                          ])
                        }
                      >
                        {mine.length === 0
                          ? 'Return this part'
                          : 'Add another condition'}
                      </Button>
                    </Group>
                  ) : left < 0 ? (
                    <Text c="red" size="sm">
                      That is {formatQty(String(-left))} more than can come
                      back.
                    </Text>
                  ) : mine.length === 0 ? (
                    <span className="dax-sub">Everything is already back.</span>
                  ) : null}
                </div>
              );
            })
          : null}

        {mode.kind === 'free' ? (
          <>
            {rows.length === 0 ? (
              <Empty title="No parts yet">
                Scan or search for each part coming back.
              </Empty>
            ) : (
              indexed.map(({ row, index }) => (
                <div key={row.key} className="dax-line">
                  <div className="dax-line-top">
                    <PartHead part={row.part} />
                    <RemoveButton
                      label={`Remove ${row.part.partNo}`}
                      onClick={() => remove(row.key)}
                    />
                  </div>
                  <RowEditor
                    row={row}
                    index={index}
                    usualBinId={usualBins[row.part.id] ?? null}
                    err={err}
                    patch={(change) => patch(row.key, change)}
                  />
                </div>
              ))
            )}
            <Group>
              <PartFinder
                onPick={addFreePart}
                label="Add a part"
                title="Add a part"
                scanHint="Each scan adds a line, so different conditions stay separate."
              />
            </Group>
          </>
        ) : null}

        {err('lines') ? (
          <Text c="red" size="sm">
            Add at least one part.
          </Text>
        ) : null}
      </Stack>

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

      <div className="dax-bar">
        <span className="note">
          Stock changes only when the return is posted.
        </span>
        <Button
          size="lg"
          variant={canPost ? 'default' : 'filled'}
          loading={pending}
          onClick={() => send(false)}
        >
          {draft ? 'Save' : 'Save draft'}
        </Button>
        {canPost ? (
          <Button size="lg" loading={pending} onClick={() => send(true)}>
            {draft ? 'Save and post' : 'Post return'}
          </Button>
        ) : null}
      </div>
    </Stack>
  );
}
