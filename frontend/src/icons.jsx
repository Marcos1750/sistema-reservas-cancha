export function Icon({ name, size = 20, strokeWidth = 1.8, className = '' }) {
  const paths = {
    pin: <><path d="M12 21s6-5.3 6-11a6 6 0 1 0-12 0c0 5.7 6 11 6 11Z" /><circle cx="12" cy="10" r="2" /></>,
    search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.3 4.3" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
    down: <path d="m6 9 6 6 6-6" />,
    calendar: <><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M7 3v4M17 3v4M3.5 9h17" /></>,
    clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3.5 2" /></>,
    star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z" />,
    arrow: <><path d="M4 12h15" /><path d="m13 6 6 6-6 6" /></>,
    back: <><path d="M19 12H5" /><path d="m11 18-6-6 6-6" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    heart: <path d="M20.8 8.8c0 5.1-8.8 10.2-8.8 10.2S3.2 13.9 3.2 8.8A4.6 4.6 0 0 1 12 6.4a4.6 4.6 0 0 1 8.8 2.4Z" />,
    home: <><path d="m3.5 10.5 8.5-7 8.5 7" /><path d="M5.5 9.5v10h13v-10M9.5 19.5v-6h5v6" /></>,
    ticket: <><path d="M4 7.5A2.5 2.5 0 0 0 6.5 5h11A2.5 2.5 0 0 0 20 7.5v9a2.5 2.5 0 0 0-2.5 2.5h-11A2.5 2.5 0 0 0 4 16.5v-9Z" /><path d="M12 7v2M12 15v2M12 11v2" /></>,
    user: <><circle cx="12" cy="8" r="3.2" /><path d="M5 20c.9-3.1 3.3-4.7 7-4.7s6.1 1.6 7 4.7" /></>,
    filter: <><path d="M4 6h16M7 12h10M10 18h4" /></>,
    check: <path d="m5 12 4.5 4.5L19 7" />,
    logout: <><path d="M10 5H5v14h5M14 8l4 4-4 4M18 12H9" /></>,
    menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
    pitch: <><rect x="4" y="4" width="16" height="16" rx="1" /><path d="M12 4v16M4 12h16M7 8h3v8H7M17 8h-3v8h3" /></>,
    spark: <><path d="M12 2.8 13.5 9l5.7 1.5-5.7 1.5-1.5 6.2-1.5-6.2-5.7-1.5L10.5 9 12 2.8Z" /><path d="m19 3 .5 2 1.8.5-1.8.5L19 8l-.5-2-1.8-.5 1.8-.5L19 3Z" /></>,
  };

  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name] || paths.spark}
    </svg>
  );
}

export function PitchMark({ compact = false }) {
  return (
    <span className={`pitch-mark${compact ? ' pitch-mark--compact' : ''}`} aria-hidden="true">
      <span className="pitch-mark__line pitch-mark__line--top" />
      <span className="pitch-mark__line pitch-mark__line--mid" />
      <span className="pitch-mark__dot" />
    </span>
  );
}
