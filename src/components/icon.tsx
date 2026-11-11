import type { CSSProperties } from "react";

const paths = {
  arrow: <><path d="M5 12h14M12 5l7 7-7 7" /></>,
  arrowLeft: <><path d="M19 12H5M12 19l-7-7 7-7" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  chevron: <path d="m6 9 6 6 6-6" />,
  upload: <><path d="M12 16V4m-5 5 5-5 5 5M4 16v4h16v-4" /></>,
  download: <><path d="M12 4v12m-5-5 5 5 5-5M4 16v4h16v-4" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></>,
  people: <><circle cx="9" cy="7" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6m2 4a6 6 0 0 1 3 5v2" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 11h18" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10v1" /></>,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  compass: <><circle cx="12" cy="12" r="9" /><path d="m16 8-2 6-6 2 2-6Z" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></>,
  award: <><circle cx="12" cy="8" r="6" /><path d="m15.4 12.8 2.6 8.2-6-3-6 3 2.6-8.2" /></>,
  refresh: <><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" /><path d="M16 21h5v-5" /></>,
  sparkles: <><path d="m12 3 1.9 4.8L19 9.7l-3.8 3.7.9 5.3-4.1-2.2-4.1 2.2.9-5.3L5 9.7l5.1-1.9Z" /></>,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
} as const;

export function Icon({ name, size = 20, style }: { name: keyof typeof paths; size?: number; style?: CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>{paths[name]}</svg>;
}
