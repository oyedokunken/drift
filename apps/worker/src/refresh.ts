import { summarise } from '@drift/engine';
import type { ArrivalSummary, LineId } from '@drift/shared';
import type { Logger } from './log.ts';
import type { Store } from './store.ts';
import { LINE_GROUPS, fetchGroupPredictions } from './tfl.ts';
import type { UpstreamOptions } from './upstream.ts';

export interface RefreshDeps {
  readonly upstream: UpstreamOptions;
  readonly store: Store;
  readonly log: Logger;
  readonly now: () => Date;
}

export interface RefreshReport {
  readonly refreshed: readonly LineId[];
  readonly failed: readonly LineId[];
}

/**
 * Fetch every group of lines in parallel, reduce each line to a summary and store
 * them. A failing group leaves its lines' previous summaries in place, so they age
 * rather than disappear, and never blocks the other groups.
 */
export async function refreshSummaries(deps: RefreshDeps): Promise<RefreshReport> {
  const outcomes = await Promise.all(
    LINE_GROUPS.map(async (lines) => {
      try {
        const fetchedAt = deps.now();
        const { predictions } = await fetchGroupPredictions(
          lines,
          deps.upstream,
          deps.log,
        );
        const summaries: ArrivalSummary[] = lines.map((lineId) =>
          summarise(
            lineId,
            predictions.filter((p) => p.lineId === lineId),
            fetchedAt,
          ),
        );
        return { lines, summaries, ok: true as const };
      } catch (error) {
        deps.log('error', 'group_refresh_failed', {
          lines: lines.join(','),
          reason: error instanceof Error ? error.message : 'unknown error',
        });
        return { lines, summaries: [] as ArrivalSummary[], ok: false as const };
      }
    }),
  );

  const summaries = outcomes.flatMap((outcome) => outcome.summaries);
  if (summaries.length > 0) await deps.store.saveSummaries(summaries);

  const report: RefreshReport = {
    refreshed: outcomes.filter((o) => o.ok).flatMap((o) => o.lines),
    failed: outcomes.filter((o) => !o.ok).flatMap((o) => o.lines),
  };
  deps.log('info', 'refresh_done', {
    refreshed: report.refreshed.length,
    failed: report.failed.length,
  });
  return report;
}
