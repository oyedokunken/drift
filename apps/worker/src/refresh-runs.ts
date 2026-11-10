import type { RefreshReport } from './refresh.ts';

/**
 * Decides when a refresh request can share one already running. A refresh of every line
 * covers any phase, so a phase request joins it. Otherwise a request joins only a run of
 * the same phase: one phase must never swallow the other, or its lines would never update.
 */
export function createRefreshRuns(
  run: (phase: number | undefined) => Promise<RefreshReport>,
  phases: number,
): (phase?: number) => Promise<RefreshReport> {
  const inflight = new Map<number | 'all', Promise<RefreshReport>>();

  return (phase) => {
    const key = phase === undefined ? 'all' : phase % phases;
    const shared = inflight.get('all') ?? inflight.get(key);
    if (shared !== undefined) return shared;

    const started = run(phase === undefined ? undefined : phase % phases).finally(() => {
      inflight.delete(key);
    });
    inflight.set(key, started);
    return started;
  };
}
