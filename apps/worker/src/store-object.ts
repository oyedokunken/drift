import { DurableObject } from 'cloudflare:workers';
import {
  arrivalSummarySchema,
  snapshotSchema,
  type ArrivalSummary,
  type Snapshot,
} from '@drift/shared';
import { createBusService, type BusOutcome } from './bus.ts';
import type { Env } from './env.ts';
import { refreshSummaries, type RefreshReport } from './refresh.ts';
import { LINE_GROUPS, REFRESH_PHASES } from './tfl.ts';
import { productionRuntime } from './runtime.ts';
import type { Store } from './store.ts';

const SUMMARY_PREFIX = 'summary:';
const SNAPSHOT_KEY = 'snapshot';

/**
 * Holds one summary per line and the last good snapshot in SQLite backed storage, and
 * runs the heavy refresh. Parsing the arrivals feed happens here, never in the
 * request handler. Everything read back is validated, since storage is a boundary.
 */
export class DriftStore extends DurableObject<Env> implements Store {
  saveSummaries(summaries: readonly ArrivalSummary[]): Promise<void> {
    for (const summary of summaries) {
      this.ctx.storage.kv.put(`${SUMMARY_PREFIX}${summary.lineId}`, summary);
    }
    return Promise.resolve();
  }

  private readSummaries(): ArrivalSummary[] {
    const summaries: ArrivalSummary[] = [];
    for (const [, value] of this.ctx.storage.kv.list({ prefix: SUMMARY_PREFIX })) {
      const parsed = arrivalSummarySchema.safeParse(value);
      if (parsed.success) summaries.push(parsed.data);
    }
    return summaries;
  }

  loadSummaries(): Promise<ArrivalSummary[]> {
    return Promise.resolve(this.readSummaries());
  }

  saveSnapshot(snapshot: Snapshot): Promise<void> {
    this.ctx.storage.kv.put(SNAPSHOT_KEY, snapshot);
    return Promise.resolve();
  }

  loadSnapshot(): Promise<Snapshot | null> {
    const parsed = snapshotSchema.safeParse(this.ctx.storage.kv.get(SNAPSHOT_KEY));
    return Promise.resolve(parsed.success ? parsed.data : null);
  }

  private inflight: Promise<RefreshReport> | null = null;

  private busService: ReturnType<typeof createBusService> | undefined;

  /**
   * Checks one bus route. Everything heavy happens here: the route list, the large
   * arrivals payload, the cache, coalescing and the request budget all live in this
   * object, so the request handler only validates the route and relays the answer.
   */
  checkBus(route: string): Promise<BusOutcome> {
    this.busService ??= (() => {
      const { log, upstream } = productionRuntime(this.env);
      return createBusService({
        upstream,
        log,
        now: () => new Date(),
        kv: this.ctx.storage.kv,
        summaries: () => this.readSummaries(),
      });
    })();
    return this.busService.check(route);
  }

  /**
   * Called by the cron trigger every minute with a phase, which picks the groups of
   * lines to refresh, and by the request path on a cold start with none, which refreshes
   * every group. Callers that arrive while a refresh runs share it, so a burst of
   * visitors on an empty store costs one round of TfL fetches.
   */
  refresh(phase?: number): Promise<RefreshReport> {
    const { log, upstream } = productionRuntime(this.env);
    const groups =
      phase === undefined
        ? LINE_GROUPS
        : (REFRESH_PHASES[phase % REFRESH_PHASES.length] ?? LINE_GROUPS);
    this.inflight ??= refreshSummaries(
      {
        upstream,
        store: this,
        log,
        now: () => new Date(),
      },
      groups,
    ).finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }
}
