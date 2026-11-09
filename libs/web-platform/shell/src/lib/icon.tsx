import type { ReactNode } from 'react';

const PATHS: Record<string, ReactNode> = {
  home: (
    <>
      <path d="M4 10.5L12 4l8 6.5" />
      <path d="M6 9.5V20h12V9.5" />
      <path d="M10 20v-5h4v5" />
    </>
  ),
  grid: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="2" />
    </>
  ),
  box: (
    <>
      <path d="M20.5 7.5L12 3 3.5 7.5 12 12z" />
      <path d="M3.5 7.5v9L12 21l8.5-4.5v-9" />
      <path d="M12 12v9" />
    </>
  ),
  boxes: (
    <>
      <rect x="3.5" y="12.5" width="8" height="8" rx="1.5" />
      <rect x="12.5" y="12.5" width="8" height="8" rx="1.5" />
      <rect x="8" y="3.5" width="8" height="8" rx="1.5" />
    </>
  ),
  tag: (
    <>
      <path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1.5 1.5 0 0 1 0 2.1l-6.4 6.4a1.5 1.5 0 0 1-2.1 0z" />
      <circle cx="8" cy="8" r="1.4" />
    </>
  ),
  layers: (
    <>
      <path d="M12 3.5l8.5 4.5L12 12.5 3.5 8z" />
      <path d="M3.5 12l8.5 4.5 8.5-4.5" />
      <path d="M3.5 16l8.5 4.5 8.5-4.5" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8.5" r="3.5" />
      <path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5" />
      <path d="M15.5 5.3a3.3 3.3 0 0 1 0 6.4" />
      <path d="M18 14.8c2 .7 3.2 2.4 3.5 5.2" />
    </>
  ),
  building: (
    <>
      <rect x="4.5" y="3.5" width="10" height="17" rx="1.5" />
      <path d="M14.5 9.5h4a1 1 0 0 1 1 1v10h-5" />
      <path d="M8 7.5h3M8 11h3M8 14.5h3M8.5 20.5v-3h2v3" />
    </>
  ),
  scan: (
    <>
      <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" />
      <path d="M4 12h16" />
    </>
  ),
  qr: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <path d="M13.5 13.5h3v3h-3zM17.5 17.5h3v3h-3zM20.5 13.5v1M13.5 20.5h1" />
    </>
  ),
  shield: (
    <path d="M12 3.5l7.5 3v5.5c0 4.6-3.2 7.6-7.5 8.5-4.3-.9-7.5-3.9-7.5-8.5V6.5z" />
  ),
  key: (
    <>
      <circle cx="8" cy="15.5" r="4" />
      <path d="M10.8 12.7L19.5 4M16 7.5l2.5 2.5M18.5 5l1.5 1.5" />
    </>
  ),
  hierarchy: (
    <>
      <rect x="9" y="3.5" width="6" height="5" rx="1.5" />
      <rect x="3.5" y="15.5" width="6" height="5" rx="1.5" />
      <rect x="14.5" y="15.5" width="6" height="5" rx="1.5" />
      <path d="M12 8.5v3.5M6.5 15.5V12h11v3.5" />
    </>
  ),
  puzzle: (
    <path d="M9.5 4.5a2 2 0 0 1 4 0v1.5h4a1 1 0 0 1 1 1v4h-1.5a2 2 0 0 0 0 4h1.5v4a1 1 0 0 1-1 1h-4V18.5a2 2 0 0 0-4 0V20h-4a1 1 0 0 1-1-1v-4H6a2 2 0 0 0 0-4H4.5V7a1 1 0 0 1 1-1h4z" />
  ),
  hash: <path d="M9.5 3.5L7.5 20.5M16.5 3.5l-2 17M4.5 8.5h16M3.5 15.5h16" />,
  history: (
    <>
      <path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5" />
      <path d="M4 4v4.5h4.5" />
      <path d="M12 8v4.5l3 2" />
    </>
  ),
  table: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <path d="M3.5 10h17M9.5 10v9.5" />
    </>
  ),
  chart: (
    <>
      <path d="M4 4.5v15h16" />
      <path d="M7.5 14.5l3.5-4 3 2.5 5-6" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.2-4.2" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  send: (
    <>
      <path d="M21 3L10.5 13.5" />
      <path d="M21 3l-6.5 18-4-7.5L3 9.5z" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  camera: (
    <>
      <path d="M4 8.5a2 2 0 0 1 2-2h2l1.5-2h5L16 6.5h2a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  arrow: <path d="M7 17L17 7M8.5 7H17v8.5" />,
  chevron: <path d="M6 9.5l6 6 6-6" />,
  back: <path d="M14.5 6l-6 6 6 6" />,
  check: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.2 12.4l2.6 2.6 5-5.4" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4l9 16H3z" />
      <path d="M12 10v4.5M12 17.5v.01" />
    </>
  ),
  printer: (
    <>
      <path d="M7 8V3.5h10V8" />
      <rect x="3.5" y="8" width="17" height="8" rx="2" />
      <path d="M7 13.5h10v7H7z" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V4M7 8.5L12 4l5 4.5" />
      <path d="M4 15.5v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </>
  ),
  logout: (
    <>
      <path d="M14.5 4.5h3a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-3" />
      <path d="M10 8l-4 4 4 4M6 12h9" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4" />
    </>
  ),
  moon: <path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z" />,
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20.5c.8-4 3.7-6 7.5-6s6.7 2 7.5 6" />
    </>
  ),
  'user-plus': (
    <>
      <circle cx="10" cy="8" r="4" />
      <path d="M3 20.5c.8-4 3.4-6 7-6 1.6 0 3 .4 4.1 1.1" />
      <path d="M18.5 14v6M15.5 17h6" />
    </>
  ),
  truck: (
    <>
      <path d="M3.5 6.5h10v10h-10z" />
      <path d="M13.5 9.5h4l3 3.5v3.5h-7" />
      <circle cx="7.5" cy="17.5" r="1.8" />
      <circle cx="17" cy="17.5" r="1.8" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.3" />
    </>
  ),
  barcode: <path d="M4 5v14M7 5v14M10.5 5v14M13 5v14M16.5 5v14M20 5v14" />,
  download: (
    <>
      <path d="M12 4v12M7 11.5l5 4.5 5-4.5" />
      <path d="M4 15.5v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" />
      <path d="M13.5 6.5l4 4" />
    </>
  ),
  archive: (
    <>
      <rect x="3.5" y="4.5" width="17" height="4.5" rx="1.5" />
      <path d="M5 9v9.5a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5V9" />
      <path d="M10 13h4" />
    </>
  ),
  mail: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
      <path d="M4 7l8 6 8-6" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3.6 14H3.5a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9.5a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1h.2a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
    </>
  ),
};

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  label,
  size,
}: {
  name: string;
  label?: string;
  size?: number;
}) {
  return (
    <svg
      className="dax-ico"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      style={size ? { width: size, height: size } : undefined}
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
    >
      {PATHS[name] ?? PATHS['grid']}
    </svg>
  );
}
