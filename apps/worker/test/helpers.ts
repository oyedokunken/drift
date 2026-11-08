import type { ArrivalSummary, Snapshot } from '@drift/shared';
import { createLogger, type Logger } from '../src/log.ts';
import type { Store } from '../src/store.ts';
import type { UpstreamOptions } from '../src/upstream.ts';

/** A stand in for the TfL key. Tests assert it never appears in any output. */
export const KEY = 'SENTINEL-KEY-0123456789abcdef';

export function json(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  return new Response(JSON.stringify(body), { ...init, headers });
}

/** A copy of the object without one property, for building responses with a field missing. */
export function omit(value: object, key: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([name]) => name !== key));
}

export function collectLogs(): { lines: string[]; log: Logger } {
  const lines: string[] = [];
  return {
    lines,
    log: createLogger(KEY, (line) => {
      lines.push(line);
    }),
  };
}

type FetchHandler = (
  url: URL,
  init: RequestInit | undefined,
) => Response | Promise<Response>;

/** A fetch that records every URL it was called with and answers via the handler. */
export function fakeFetch(handler: FetchHandler): { fetch: typeof fetch; calls: URL[] } {
  const calls: URL[] = [];
  const impl = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    calls.push(url);
    return Promise.resolve(handler(url, init));
  };
  return { fetch: impl, calls };
}

/** A request that never answers until it is aborted, like a hung connection. */
export function hang(init: RequestInit | undefined): Promise<Response> {
  return new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => {
      reject(new DOMException('aborted', 'AbortError'));
    });
  });
}

export function upstreamOptions(
  fetchImpl: typeof fetch,
  log: Logger,
  overrides: Partial<UpstreamOptions> = {},
): UpstreamOptions & { sleeps: number[] } {
  const sleeps: number[] = [];
  return {
    key: KEY,
    fetch: fetchImpl,
    log,
    sleep: (ms) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
    random: () => 0.5,
    timeoutMs: 1000,
    maxAttempts: 3,
    baseDelayMs: 100,
    maxRetryAfterMs: 3000,
    sleeps,
    ...overrides,
  };
}

export interface MemoryStore extends Store {
  summaries: Map<string, ArrivalSummary>;
  snapshot: Snapshot | null;
  failLoadSummaries: boolean;
  failLoadSnapshot: boolean;
  failSaveSnapshot: boolean;
}

export function memoryStore(): MemoryStore {
  const store: MemoryStore = {
    summaries: new Map(),
    snapshot: null,
    failLoadSummaries: false,
    failLoadSnapshot: false,
    failSaveSnapshot: false,
    saveSummaries(summaries) {
      for (const summary of summaries) store.summaries.set(summary.lineId, summary);
      return Promise.resolve();
    },
    loadSummaries() {
      if (store.failLoadSummaries)
        return Promise.reject(new Error('storage unavailable'));
      return Promise.resolve([...store.summaries.values()]);
    },
    saveSnapshot(snapshot) {
      if (store.failSaveSnapshot) return Promise.reject(new Error('storage unavailable'));
      store.snapshot = snapshot;
      return Promise.resolve();
    },
    loadSnapshot() {
      if (store.failLoadSnapshot) return Promise.reject(new Error('storage unavailable'));
      return Promise.resolve(store.snapshot);
    },
  };
  return store;
}

/** A TfL status response for the given line ids, all Good Service unless told otherwise. */
export function statusBody(
  ids: readonly string[],
  severity = 10,
  label = 'Good Service',
) {
  return ids.map((id) => ({
    $type: 'Tfl.Api.Presentation.Entities.Line, Tfl.Api.Presentation.Entities',
    id,
    name: id,
    modeName: 'tube',
    lineStatuses: [{ statusSeverity: severity, statusSeverityDescription: label }],
    disruptions: [],
  }));
}

/** A TfL prediction in its full shape, with the extra fields Drift ignores. */
export function tflPrediction(overrides: Record<string, unknown> = {}) {
  return {
    $type: 'Tfl.Api.Presentation.Entities.Prediction, Tfl.Api.Presentation.Entities',
    id: '1',
    vehicleId: 'v1',
    naptanId: 'stop',
    stationName: 'Somewhere Underground Station',
    lineId: 'central',
    lineName: 'Central',
    platformName: 'Westbound - Platform 1',
    direction: 'inbound',
    timestamp: '2026-11-08T09:00:00Z',
    timeToStation: 120,
    towards: 'Ealing Broadway',
    expectedArrival: '2026-11-08T09:02:00Z',
    modeName: 'tube',
    timing: { read: '2026-11-08T09:00:00Z' },
    ...overrides,
  };
}
