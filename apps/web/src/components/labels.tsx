'use client';

import {
  Alert,
  Button,
  Checkbox,
  Group,
  Modal,
  NumberInput,
  Stack,
  Text,
} from '@mantine/core';
import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useState,
} from 'react';
import { LABELS_PER_SHEET } from '@dax/inventory-contract';

export type LabelKind = 'item' | 'bin';
const MAX_IDS = 240;

function sheetsNeeded(labels: number, skip: number): number {
  return Math.ceil((labels + skip) / LABELS_PER_SHEET);
}

export function PrintLabelsDialog({
  kind,
  ids,
  opened,
  onClose,
}: {
  kind: LabelKind;
  ids: string[];
  opened: boolean;
  onClose: () => void;
}) {
  const [copies, setCopies] = useState(1);
  const [skip, setSkip] = useState(0);
  const total = ids.length * copies;
  const tooMany = ids.length > MAX_IDS;

  return (
    <Modal opened={opened} onClose={onClose} title="Print labels" centered>
      <form
        method="post"
        action="/api/labels"
        target="_blank"
        onSubmit={() => window.setTimeout(onClose, 0)}
      >
        <input type="hidden" name="kind" value={kind} />
        {ids.map((id) => (
          <input key={id} type="hidden" name="ids" value={id} />
        ))}
        <Stack>
          <Text size="sm">
            Labels print on A4 sticker sheets of {LABELS_PER_SHEET} (3 across, 8
            down). The PDF opens in a new tab.
          </Text>
          {tooMany ? (
            <Alert color="orange">
              Print at most {MAX_IDS} {kind === 'item' ? 'items' : 'bins'} at a
              time.
            </Alert>
          ) : null}
          <NumberInput
            name="copies"
            label="Copies of each label"
            min={1}
            max={LABELS_PER_SHEET}
            clampBehavior="strict"
            allowDecimal={false}
            allowNegative={false}
            value={copies}
            onChange={(v) => setCopies(typeof v === 'number' && v > 0 ? v : 1)}
            size="md"
          />
          <NumberInput
            name="skip"
            label="Skip labels already used"
            description="For a partly used sheet: how many labels are gone from the top, counting left to right."
            min={0}
            max={LABELS_PER_SHEET - 1}
            clampBehavior="strict"
            allowDecimal={false}
            allowNegative={false}
            value={skip}
            onChange={(v) => setSkip(typeof v === 'number' && v >= 0 ? v : 0)}
            size="md"
          />
          <Text size="sm" c="dimmed">
            {total} {total === 1 ? 'label' : 'labels'} on{' '}
            {sheetsNeeded(total, skip)}{' '}
            {sheetsNeeded(total, skip) === 1 ? 'sheet' : 'sheets'}.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={tooMany || ids.length === 0}>
              Open PDF
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

export function PrintLabelsButton({
  kind,
  ids,
  label = 'Print label',
}: {
  kind: LabelKind;
  ids: string[];
  label?: string;
}) {
  const [opened, setOpened] = useState(false);
  return (
    <>
      <Button variant="default" onClick={() => setOpened(true)}>
        {label}
      </Button>
      <PrintLabelsDialog
        kind={kind}
        ids={ids}
        opened={opened}
        onClose={() => setOpened(false)}
      />
    </>
  );
}

interface Selection {
  enabled: boolean;
  selected: Set<string>;
  set: (ids: string[], on: boolean) => void;
}

const SelectionContext = createContext<Selection>({
  enabled: false,
  selected: new Set(),
  set: () => undefined,
});

export function LabelSelection({
  kind,
  enabled,
  children,
}: {
  kind: LabelKind;
  enabled: boolean;
  children: ReactNode;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [opened, setOpened] = useState(false);
  const value = useMemo<Selection>(
    () => ({
      enabled,
      selected,
      set: (ids, on) =>
        setSelected((prev) => {
          const next = new Set(prev);
          for (const id of ids) {
            if (on) next.add(id);
            else next.delete(id);
          }
          return next;
        }),
    }),
    [enabled, selected],
  );
  const ids = [...selected];

  return (
    <SelectionContext.Provider value={value}>
      {children}
      {enabled && ids.length > 0 ? (
        <div className="dax-selbar" role="region" aria-label="Selected labels">
          <b>{ids.length} selected</b>
          <Button
            variant="transparent"
            style={{ color: 'inherit' }}
            onClick={() => setSelected(new Set())}
          >
            Clear
          </Button>
          <Button color="ember" onClick={() => setOpened(true)}>
            Print labels
          </Button>
        </div>
      ) : null}
      <PrintLabelsDialog
        kind={kind}
        ids={ids}
        opened={opened}
        onClose={() => setOpened(false)}
      />
    </SelectionContext.Provider>
  );
}

export function SelectCheckbox({ id, label }: { id: string; label: string }) {
  const { enabled, selected, set } = useContext(SelectionContext);
  if (!enabled) return null;
  return (
    <Checkbox
      size="md"
      aria-label={`Select ${label}`}
      checked={selected.has(id)}
      onChange={(e) => set([id], e.currentTarget.checked)}
    />
  );
}

export function SelectAllCheckbox({ ids }: { ids: string[] }) {
  const { enabled, selected, set } = useContext(SelectionContext);
  if (!enabled || ids.length === 0) return null;
  const count = ids.filter((id) => selected.has(id)).length;
  return (
    <Checkbox
      size="md"
      aria-label="Select all on this page"
      checked={count === ids.length}
      indeterminate={count > 0 && count < ids.length}
      onChange={(e) => set(ids, e.currentTarget.checked)}
    />
  );
}

export function SelectionHint({ children }: { children: ReactNode }) {
  const { enabled } = useContext(SelectionContext);
  return enabled ? <span className="dax-sub">{children}</span> : null;
}
