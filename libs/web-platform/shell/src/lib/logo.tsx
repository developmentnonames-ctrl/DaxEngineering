const DAX_PATHS = [
  'M0.4,53V0h18.5c14.2,0,24,11.6,24,26.4S33,53,18.8,53H0.4z M14.9,42.8l1.6-0.1c8.4-0.5,11.5-9.6,11.5-16.3s-3.1-15.7-11.5-16.2l-1.6-0.1V42.8z',
  'M72.6,0L92,53H77.7l-2.4-8.6H59.5L57.1,53H42.9L62.2,0H72.6z M62.7,32.4h9.5l-4.7-16.9L62.7,32.4z',
  'M93.4,53L110,26.1L93.9,0h14.8l8.3,15.7L125.2,0h14.7l-16.6,27l16,26h-14.7l-8.2-15.7L108.1,53H93.4z',
];

const SUBTITLE = 'ENGINEERING';

export function DaxLogo({ className }: { className?: string }) {
  return (
    <span
      className={className ? `dax-logo ${className}` : 'dax-logo'}
      role="img"
      aria-label="DAX Engineering"
    >
      <svg viewBox="0 0 140 53" fill="currentColor" aria-hidden="true">
        {DAX_PATHS.map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
      <span className="dax-logo-sub" aria-hidden="true">
        {[...SUBTITLE].map((c, i) => (
          <span key={i}>{c}</span>
        ))}
      </span>
    </span>
  );
}
