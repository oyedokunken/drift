import { config, evaluateBus, isFeedHealthy, summariseWith } from '@drift/engine';
import type { ArrivalSummary, BusResult } from '@drift/shared';
import { busResultSchema } from '@drift/shared';
import { z } from 'zod';
import type { Logger } from './log.ts';
import { fetchBusRoute, fetchBusRoutes, type BusRouteName } from './tfl.ts';
import type { UpstreamOptions } from './upstream.ts';

/** How long one route's result is reused, so repeat searches cost TfL nothing. */
export const BUS_CACHE_SECONDS = 45;

/** The route list changes rarely, so it is fetched once a day. */
export const BUS_ROUTES_MAX_AGE_SECONDS = 24 * 60 * 60;

/** Routes kept. Beyond this the least recently used are dropped, so storage cannot grow. */
export const BUS_MAX_ROUTES = 200;

/**
 * TfL requests the bus path may make in any rolling minute. TfL allows 500 a minute for
 * the key. The cron refresh makes 10 a minute and the snapshot at most a few more, so 120
 * leaves the key well under the limit even if every search misses the cache. A check
 * costs two requests (status and arrivals), so this is 60 route checks a minute.
 */
export const BUS_REQUESTS_PER_MINUTE = 120;

const ROUTES_KEY = 'bus-routes';
const INDEX_KEY = 'bus-index';
const entryKey = (route: string): string => `bus:${route}`;

/** The slice of Durable Object storage the bus path uses, so tests can use a Map. */
export interface BusKv {
  get(key: string): unknown;
  put(key: string, value: unknown): void;
  delete(key: string): void;
}

interface StoredRoutes {
  readonly fetchedAt: string;
  readonly routes: readonly BusRouteName[];
}

/** What is kept per route: the last result, and when buses were last seen on it. */
const storedEntrySchema = z.object({
  result: busResultSchema,
  lastRunningAt: z.iso.datetime().nullable(),
});

type StoredEntry = z.infer<typeof storedEntrySchema>;

export type BusOutcome =
  | { readonly kind: 'ok'; readonly result: BusResult }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'busy'; readonly retryAfterSeconds: number }
  | { readonly kind: 'unavailable' };

export interface BusDeps {
  readonly upstream: UpstreamOptions;
  readonly kv: BusKv;
  readonly summaries: () => readonly ArrivalSummary[];
  readonly log: Logger;
  readonly now: () => Date;
}

/** Counts requests in a rolling window and refuses once the limit is spent. */
export class RequestBudget {
  private readonly stamps: number[] = [];

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number,
  ) {}

  private prune(): void {
    const cutoff = this.now() - this.windowMs;
    while (this.stamps.length > 0 && (this.stamps[0] ?? 0) <= cutoff) this.stamps.shift();
  }

  /** Spends `count` requests if the window has room, and says whether it did. */
  take(count: number): boolean {
    this.prune();
    if (this.stamps.length + count > this.limit) return false;
    for (let i = 0; i < count; i++) this.stamps.push(this.now());
    return true;
  }

  /** Seconds until enough of the window has passed for a request to be allowed again. */
  retryAfterSeconds(): number {
    this.prune();
    const oldest = this.stamps[0];
    if (oldest === undefined) return 1;
    return Math.max(1, Math.ceil((oldest + this.windowMs - this.now()) / 1000));
  }
}

function isStoredRoutes(value: unknown): value is StoredRoutes {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { fetchedAt?: unknown; routes?: unknown };
  return typeof candidate.fetchedAt === 'string' && Array.isArray(candidate.routes);
}

function ageSeconds(iso: string, now: Date): number {
  return (now.getTime() - Date.parse(iso)) / 1000;
}

/**
 * Checks bus routes on demand. Runs inside the Durable Object, so the large arrivals
 * payload is parsed there and never in the request handler. Concurrent checks of one
 * route share a single fetch, each route's result is reused for 45 seconds, at most 200
 * routes are remembered, and a rolling request budget keeps the TfL key under its limit.
 */
export function createBusService(deps: BusDeps): {
  check(route: string): Promise<BusOutcome>;
} {
  const { upstream, kv, log } = deps;
  const budget = new RequestBudget(BUS_REQUESTS_PER_MINUTE, 60_000, () =>
    deps.now().getTime(),
  );
  const inflight = new Map<string, Promise<BusOutcome>>();
  let routesInflight: Promise<StoredRoutes | null> | null = null;

  function readRoutes(): StoredRoutes | null {
    const stored = kv.get(ROUTES_KEY);
    return isStoredRoutes(stored) ? stored : null;
  }

  async function refreshRoutes(): Promise<StoredRoutes | null> {
    if (!budget.take(1)) return readRoutes();
    try {
      const routes = await fetchBusRoutes(upstream);
      const stored: StoredRoutes = { fetchedAt: deps.now().toISOString(), routes };
      kv.put(ROUTES_KEY, stored);
      return stored;
    } catch (error) {
      log('error', 'bus_routes_refresh_failed', { reason: reasonOf(error) });
      return readRoutes();
    }
  }

  /** The stored route list, refreshed when it is missing or a day old. */
  async function routes(): Promise<StoredRoutes | null> {
    const stored = readRoutes();
    if (
      stored !== null &&
      ageSeconds(stored.fetchedAt, deps.now()) < BUS_ROUTES_MAX_AGE_SECONDS
    ) {
      return stored;
    }
    routesInflight ??= refreshRoutes().finally(() => {
      routesInflight = null;
    });
    return routesInflight;
  }

  function readEntry(route: string): StoredEntry | null {
    const parsed = storedEntrySchema.safeParse(kv.get(entryKey(route)));
    return parsed.success ? parsed.data : null;
  }

  /** Stores an entry as the most recently used and drops the oldest beyond the cap. */
  function saveEntry(entry: StoredEntry): void {
    const { result } = entry;
    kv.put(entryKey(result.route), entry);
    const index = kv.get(INDEX_KEY);
    const previous = Array.isArray(index)
      ? index.filter((item): item is string => typeof item === 'string')
      : [];
    const next = [result.route, ...previous.filter((route) => route !== result.route)];
    for (const evicted of next.slice(BUS_MAX_ROUTES)) kv.delete(entryKey(evicted));
    kv.put(INDEX_KEY, next.slice(0, BUS_MAX_ROUTES));
  }

  const stale = (entry: StoredEntry): BusOutcome => ({
    kind: 'ok',
    result: { ...entry.result, stale: true },
  });

  async function fetchAndEvaluate(
    route: string,
    name: string,
    earlier: StoredEntry | null,
  ): Promise<BusOutcome> {
    if (!budget.take(2)) {
      log('warn', 'bus_budget_spent', { route });
      return earlier === null
        ? { kind: 'busy', retryAfterSeconds: budget.retryAfterSeconds() }
        : stale(earlier);
    }
    try {
      const { statuses, predictions } = await fetchBusRoute(route, upstream, log);
      const now = deps.now();
      const summary = summariseWith(config.BUS_PROFILE, predictions, now);
      const verdict = evaluateBus({
        routeId: route,
        statuses,
        summary,
        lastRunningAt:
          earlier === null || earlier.lastRunningAt === null
            ? null
            : new Date(earlier.lastRunningAt),
        feedHealthy: isFeedHealthy(deps.summaries(), now),
        now,
      });
      const result: BusResult = {
        route,
        name,
        checkedAt: now.toISOString(),
        stale: false,
        verdict,
      };
      saveEntry({
        result,
        lastRunningAt:
          predictions.length > 0 ? now.toISOString() : (earlier?.lastRunningAt ?? null),
      });
      return { kind: 'ok', result };
    } catch (error) {
      log('error', 'bus_check_failed', { route, reason: reasonOf(error) });
      return earlier === null ? { kind: 'unavailable' } : stale(earlier);
    }
  }

  async function run(route: string): Promise<BusOutcome> {
    const list = await routes();
    if (list === null) return { kind: 'unavailable' };
    const known = list.routes.find((candidate) => candidate.id === route);
    if (known === undefined) return { kind: 'not_found' };

    const earlier = readEntry(route);
    if (
      earlier !== null &&
      ageSeconds(earlier.result.checkedAt, deps.now()) < BUS_CACHE_SECONDS
    ) {
      return { kind: 'ok', result: earlier.result };
    }
    return fetchAndEvaluate(route, known.name, earlier);
  }

  return {
    check(route) {
      const running = inflight.get(route);
      if (running !== undefined) return running;
      const started = run(route).finally(() => {
        inflight.delete(route);
      });
      inflight.set(route, started);
      return started;
    },
  };
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
