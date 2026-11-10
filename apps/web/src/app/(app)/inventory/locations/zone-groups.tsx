'use client';

import { TableTbody, TableTd, TableTr } from '@mantine/core';
import { Icon } from '@dax/web-shell';
import { type ReactNode, useEffect, useId, useState } from 'react';
import { SelectAllCheckbox } from '../../../../components/labels';

// Collapsed zones are remembered per browser, so they stay closed when you
// change page, filter or reload. Storage can be unavailable; then every zone
// just starts open.
const KEY = 'dax.bins.collapsed-zones';

function readCollapsed(): Set<string> {
  try {
    const raw = window.localStorage.getItem(KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function useZoneOpen(zoneId: string): [boolean, () => void] {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    setOpen(!readCollapsed().has(zoneId));
  }, [zoneId]);
  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      const collapsed = readCollapsed();
      if (next) collapsed.delete(zoneId);
      else collapsed.add(zoneId);
      window.localStorage.setItem(KEY, JSON.stringify([...collapsed]));
    } catch {
      // Not remembered; the zone still opens and closes.
    }
  };
  return [open, toggle];
}

export interface ZoneHead {
  id: string;
  code: string;
  name: string;
  /** Bins in the zone across all pages. */
  binCount: number;
  /** Bins of this zone on the current page, for "select all in zone". */
  ids: string[];
}

function HeadContent({
  zone,
  open,
  toggle,
  controls,
}: {
  zone: ZoneHead;
  open: boolean;
  toggle: () => void;
  controls: string;
}) {
  const partial = zone.ids.length < zone.binCount;
  return (
    <button
      type="button"
      className="dax-zone-head"
      aria-expanded={open}
      aria-controls={controls}
      onClick={toggle}
    >
      <span className="dax-zone-chevron" data-open={open}>
        <Icon name="chevron" size={18} />
      </span>
      <span className="dax-zone sm">{zone.code}</span>
      <b>{zone.name}</b>
      <span className="dax-muted">
        {partial
          ? `${zone.ids.length} of ${zone.binCount} bins on this page`
          : `${zone.binCount} ${zone.binCount === 1 ? 'bin' : 'bins'}`}
      </span>
    </button>
  );
}

/** One zone's rows in the desktop table: a header row that opens and closes them. */
export function ZoneTbody({
  zone,
  columns,
  selectable,
  children,
}: {
  zone: ZoneHead;
  /** Columns after the checkbox column. */
  columns: number;
  selectable: boolean;
  children: ReactNode;
}) {
  const [open, toggle] = useZoneOpen(zone.id);
  const id = useId();
  return (
    <>
      <TableTbody className="dax-zone-group">
        <TableTr className="dax-zone-row">
          {selectable ? (
            <TableTd w={40}>
              <SelectAllCheckbox ids={zone.ids} />
            </TableTd>
          ) : null}
          <TableTd colSpan={columns}>
            <HeadContent
              zone={zone}
              open={open}
              toggle={toggle}
              controls={id}
            />
          </TableTd>
        </TableTr>
      </TableTbody>
      <TableTbody id={id} hidden={!open}>
        {children}
      </TableTbody>
    </>
  );
}

/** The same grouping for the phone list. */
export function ZoneSection({
  zone,
  children,
}: {
  zone: ZoneHead;
  children: ReactNode;
}) {
  const [open, toggle] = useZoneOpen(zone.id);
  const id = useId();
  return (
    <div className="dax-zone-group">
      <div className="dax-zone-row">
        <HeadContent zone={zone} open={open} toggle={toggle} controls={id} />
      </div>
      <div id={id} hidden={!open}>
        {children}
      </div>
    </div>
  );
}
