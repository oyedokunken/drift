import type { ArrivalSummary, Snapshot } from '@drift/shared';

/**
 * Where the Worker keeps state between requests. In production this is a Durable
 * Object, in tests an in-memory fake. Values coming back are validated by the
 * implementation, so callers can trust the types.
 */
export interface Store {
  saveSummaries(summaries: readonly ArrivalSummary[]): Promise<void>;
  loadSummaries(): Promise<ArrivalSummary[]>;
  saveSnapshot(snapshot: Snapshot): Promise<void>;
  loadSnapshot(): Promise<Snapshot | null>;
}
