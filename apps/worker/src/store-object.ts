import { DurableObject } from 'cloudflare:workers';
import {
  arrivalSummarySchema,
  snapshotSchema,
  type ArrivalSummary,
  type Snapshot,
} from '@drift/shared';
import type { Env } from './env.ts';
import { refreshSummaries, type RefreshReport } from './refresh.ts';
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

  loadSummaries(): Promise<ArrivalSummary[]> {
    const summaries: ArrivalSummary[] = [];
    for (const [, value] of this.ctx.storage.kv.list({ prefix: SUMMARY_PREFIX })) {
      const parsed = arrivalSummarySchema.safeParse(value);
      if (parsed.success) summaries.push(parsed.data);
    }
    return Promise.resolve(summaries);
  }

  saveSnapshot(snapshot: Snapshot): Promise<void> {
    this.ctx.storage.kv.put(SNAPSHOT_KEY, snapshot);
    return Promise.resolve();
  }

  loadSnapshot(): Promise<Snapshot | null> {
    const parsed = snapshotSchema.safeParse(this.ctx.storage.kv.get(SNAPSHOT_KEY));
    return Promise.resolve(parsed.success ? parsed.data : null);
  }

  /** Called by the cron trigger every minute. */
  refresh(): Promise<RefreshReport> {
    const { log, upstream } = productionRuntime(this.env);
    return refreshSummaries({ upstream, store: this, log, now: () => new Date() });
  }
}
