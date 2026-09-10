/** Compact "5m ago" formatting for a history row. */
export const historyRelativeTime = (iso) => {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};

/** The status pill's tone from a history entry's responseMeta. */
export const historyStatusClass = (meta) => {
  const code = meta?.status;
  if (meta?.error || code == null) return 'err';
  if (code >= 500) return 'err';
  if (code >= 400) return 'warn';
  if (code >= 200 && code < 300) return 'ok';
  return '';
};

/** The short label shown in the status pill. */
export const historyStatusLabel = (meta) => (meta?.error ? 'ERR' : (meta?.status ?? '—'));
