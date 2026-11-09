import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { Icon } from './icon';

export function PageHead({
  eyebrow,
  title,
  lede,
  back,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  lede?: ReactNode;
  back?: { href: string; label: string };
  actions?: ReactNode;
}) {
  return (
    <div className="dax-head">
      <div style={{ minWidth: 0 }}>
        {back ? (
          <Link href={back.href} className="dax-back">
            <Icon name="back" size={16} />
            {back.label}
          </Link>
        ) : null}
        {eyebrow ? <div className="dax-eyebrow">{eyebrow}</div> : null}
        <h1 className="dax-h1">{title}</h1>
        {lede ? <p className="dax-lede">{lede}</p> : null}
      </div>
      {actions ? (
        <div className="dax-head-actions">{actions}</div>
      ) : null}
    </div>
  );
}

export function SectionCard({
  title,
  note,
  actions,
  toolbar,
  flush,
  id,
  children,
}: {
  title?: ReactNode;
  note?: ReactNode;
  actions?: ReactNode;
  toolbar?: ReactNode;
  flush?: boolean;
  id?: string;
  children?: ReactNode;
}) {
  return (
    <section id={id} className={flush ? 'dax-card flush' : 'dax-card'}>
      {title || actions ? (
        <div className="dax-card-h">
          <div style={{ minWidth: 0 }}>
            {title ? <h2>{title}</h2> : null}
            {note ? <div className="dax-eyebrow">{note}</div> : null}
          </div>
          {actions ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {actions}
            </div>
          ) : null}
        </div>
      ) : null}
      {toolbar ? <div className="dax-card-tools">{toolbar}</div> : null}
      {children}
    </section>
  );
}

/** Padded body for content that sits inside a flush card next to a table. */
export function CardBody({ children }: { children: ReactNode }) {
  return <div className="dax-card-body">{children}</div>;
}

export type Tone = 'ink' | 'hi' | 'int' | 'ext' | 'ok' | 'bad' | 'yel';
export type PillTone = Exclude<Tone, 'ink'>;

const TONE_VAR: Record<Tone, string> = {
  ink: 'var(--dax-ink)',
  hi: 'var(--dax-hi)',
  int: 'var(--dax-int)',
  ext: 'var(--dax-ext)',
  ok: 'var(--dax-ok)',
  bad: 'var(--dax-bad)',
  yel: 'var(--dax-yel)',
};

export interface Kpi {
  label: string;
  value: ReactNode;
  tone?: Tone;
  href?: string;
}

export function KpiTiles({ items }: { items: Kpi[] }) {
  return (
    <div className="dax-kpis">
      {items.map((k) => {
        const style = {
          ['--c' as string]: TONE_VAR[k.tone ?? 'ink'],
        } as CSSProperties;
        const body = (
          <>
            <div className="l">{k.label}</div>
            <div className="v">{k.value}</div>
          </>
        );
        return k.href ? (
          <Link key={k.label} href={k.href} className="dax-kpi" style={style}>
            {body}
          </Link>
        ) : (
          <div key={k.label} className="dax-kpi" style={style}>
            {body}
          </div>
        );
      })}
    </div>
  );
}

export interface ActionTileItem {
  href: string;
  title: string;
  sub?: string;
  icon: string;
  tint?: 'orange' | 'blue' | 'red' | 'gray';
}

export function ActionTiles({ items }: { items: ActionTileItem[] }) {
  return (
    <div className="dax-tiles">
      {items.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`dax-tile ${t.tint ?? 'gray'}`}
        >
          <span className="badge">
            <Icon name={t.icon} size={20} />
          </span>
          <b>{t.title}</b>
          {t.sub ? <span className="sub">{t.sub}</span> : null}
        </Link>
      ))}
    </div>
  );
}

export function Pill({
  tone,
  children,
}: {
  tone?: PillTone;
  children: ReactNode;
}) {
  return (
    <span className={tone ? `dax-pill ${tone}` : 'dax-pill'}>{children}</span>
  );
}

export function Chips({
  items,
}: {
  items: { href: string; label: ReactNode; active: boolean }[];
}) {
  return (
    <div className="dax-chips">
      {items.map((c) => (
        <Link
          key={c.href}
          href={c.href}
          aria-current={c.active ? 'true' : undefined}
        >
          {c.label}
        </Link>
      ))}
    </div>
  );
}

export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="dax-empty">
      <b>{title}</b>
      {children}
    </div>
  );
}

export function Facts({
  items,
}: {
  items: { label: string; value: ReactNode }[];
}) {
  return (
    <dl className="dax-facts">
      {items.map((f) => (
        <div key={f.label}>
          <dt>{f.label}</dt>
          <dd>{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Mono({ children }: { children: ReactNode }) {
  return <span className="dax-mono">{children}</span>;
}

export function SearchBox({
  action,
  label,
  placeholder,
  name = 'q',
  defaultValue,
  wide,
}: {
  action: string;
  label: string;
  placeholder?: string;
  name?: string;
  defaultValue?: string;
  wide?: boolean;
}) {
  return (
    <form
      action={action}
      method="get"
      role="search"
      className={wide ? 'dax-search wide' : 'dax-search'}
    >
      <label>
        <Icon name="search" />
        <span className="dax-sr">{label}</span>
        <input
          type="search"
          name={name}
          placeholder={placeholder}
          defaultValue={defaultValue}
          enterKeyHint="search"
          autoComplete="off"
        />
      </label>
    </form>
  );
}

export interface LinkListItem {
  key: string;
  href?: string;
  title: ReactNode;
  sub?: ReactNode;
  aside?: ReactNode;
}

export function LinkList({ items }: { items: LinkListItem[] }) {
  return (
    <ul className="dax-list">
      {items.map((i) => {
        const body = (
          <>
            <span className="t">{i.title}</span>
            {i.sub ? <span className="s">{i.sub}</span> : null}
            {i.aside ? <span className="a">{i.aside}</span> : null}
          </>
        );
        return (
          <li key={i.key}>
            {i.href ? (
              <Link href={i.href}>{body}</Link>
            ) : (
              <div className="dax-list-row">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export interface Figure {
  label: string;
  value: ReactNode;
  unit?: ReactNode;
  bad?: boolean;
}

export function Figures({ items }: { items: Figure[] }) {
  return (
    <div className="dax-figs">
      {items.map((f) => (
        <div key={f.label} className={f.bad ? 'dax-fig bad' : 'dax-fig'}>
          <div className="l">{f.label}</div>
          <div className="v">
            {f.value}
            {f.unit ? <small>{f.unit}</small> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

export function greeting(now = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      hour: 'numeric',
      hourCycle: 'h23',
      timeZone: 'Asia/Colombo',
    }).format(now),
  );
  return hour < 12
    ? 'Good morning'
    : hour < 17
      ? 'Good afternoon'
      : 'Good evening';
}

export function todayLabel(now = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Asia/Colombo',
  }).format(now);
}
