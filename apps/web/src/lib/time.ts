/**
 * Seconds since an ISO timestamp, on the server's clock. The offset (server minus device)
 * corrects for a device clock that is wrong.
 */
export function ageSeconds(
  isoTimestamp: string,
  nowMs: number,
  serverOffsetMs: number,
): number {
  const thenMs = Date.parse(isoTimestamp);
  if (Number.isNaN(thenMs)) return 0;
  return Math.max(0, Math.round((nowMs + serverOffsetMs - thenMs) / 1000));
}

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? '' : 's'}`;
}

/** "just now", "40 seconds ago", "3 minutes ago", "2 hours ago". */
export function formatAge(seconds: number): string {
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${plural(seconds, 'second')} ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${plural(minutes, 'minute')} ago`;
  return `${plural(Math.floor(minutes / 60), 'hour')} ago`;
}
