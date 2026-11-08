import { evaluate } from '@drift/engine';
import type { ArrivalSummary, Snapshot } from '@drift/shared';
import type { Logger } from './log.ts';
import type { Store } from './store.ts';
import { fetchStatuses } from './tfl.ts';
import type { UpstreamOptions } from './upstream.ts';

export interface SnapshotDeps {
  readonly upstream: UpstreamOptions;
  readonly store: Store;
  readonly log: Logger;
  readonly now: () => Date;
}

export type SnapshotResult =
  | { readonly kind: 'fresh'; readonly snapshot: Snapshot }
  | { readonly kind: 'stale'; readonly snapshot: Snapshot }
  | { readonly kind: 'unavailable' };

function oldestFetchedAt(summaries: readonly ArrivalSummary[]): string | null {
  const times = summaries
    .map((s) => s.fetchedAt)
    .sort((a, b) => Date.parse(a) - Date.parse(b));
  return times[0] ?? null;
}

async function loadSummaries(deps: SnapshotDeps): Promise<ArrivalSummary[]> {
  try {
    return await deps.store.loadSummaries();
  } catch (error) {
    deps.log('error', 'summaries_unreadable', { reason: reason(error) });
    return [];
  }
}

async function lastGood(deps: SnapshotDeps): Promise<Snapshot | null> {
  try {
    return await deps.store.loadSnapshot();
  } catch (error) {
    deps.log('error', 'last_snapshot_unreadable', { reason: reason(error) });
    return null;
  }
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}

async function build(deps: SnapshotDeps): Promise<SnapshotResult> {
  try {
    const statuses = await fetchStatuses(deps.upstream);
    const summaries = await loadSummaries(deps);
    const now = deps.now();

    const snapshot: Snapshot = {
      generatedAt: now.toISOString(),
      statusAsOf: now.toISOString(),
      arrivalsAsOf: oldestFetchedAt(summaries),
      stale: false,
      verdicts: evaluate(statuses, summaries, now),
    };

    try {
      await deps.store.saveSnapshot(snapshot);
    } catch (error) {
      deps.log('error', 'snapshot_not_saved', { reason: reason(error) });
    }
    return { kind: 'fresh', snapshot };
  } catch (error) {
    deps.log('error', 'snapshot_build_failed', { reason: reason(error) });
    const previous = await lastGood(deps);
    if (previous === null) return { kind: 'unavailable' };
    deps.log('warn', 'serving_stale_snapshot', { generatedAt: previous.generatedAt });
    return { kind: 'stale', snapshot: { ...previous, stale: true } };
  }
}

/**
 * Builds snapshots. Concurrent callers in one isolate share a single in flight build,
 * so a burst of visitors costs one upstream status call.
 */
export function createSnapshotService(deps: SnapshotDeps): {
  get(): Promise<SnapshotResult>;
} {
  let inflight: Promise<SnapshotResult> | null = null;
  return {
    get() {
      inflight ??= build(deps).finally(() => {
        inflight = null;
      });
      return inflight;
    },
  };
}
