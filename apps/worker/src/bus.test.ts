import { describe, expect, it } from 'vitest';
import { busResultSchema, type ArrivalSummary } from '@drift/shared';
import {
  KEY,
  collectLogs,
  fakeFetch,
  json,
  statusBody,
  upstreamOptions,
} from '../test/helpers.ts';
import {
  BUS_CACHE_SECONDS,
  BUS_MAX_ROUTES,
  BUS_REQUESTS_PER_MINUTE,
  BUS_ROUTES_MAX_AGE_SECONDS,
  RequestBudget,
  createBusService,
  type BusKv,
  type BusOutcome,
} from './bus.ts';

const START = new Date('2026-11-10T14:00:00.000Z');

/** A clock the tests move by hand. */
function clock() {
  let at = START.getTime();
  return {
    now: () => new Date(at),
    advance: (seconds: number) => {
      at += seconds * 1000;
    },
  };
}

function memoryKv(): BusKv & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  return {
    data,
    get: (key) => data.get(key),
    put: (key, value) => {
      data.set(key, JSON.parse(JSON.stringify(value)));
    },
    delete: (key) => {
      data.delete(key);
    },
  };
}

const ROUTE_COUNT = 260;

/** Route 207, W11 and N207 first, then numbered filler so there are more than the cap. */
const ROUTES = [
  '207',
  'W11',
  'N207',
  ...Array.from({ length: ROUTE_COUNT }, (_, i) => `R${i + 1}`.slice(0, 4)),
]
  .filter((id, index, all) => all.indexOf(id) === index)
  .map((id) => ({ id: id.toLowerCase(), name: id }));

type Predictions = readonly { stop: number; minutes: number; bus: string }[];

/** `stops` stops, each with a bus due at every one of `dueMinutes`. */
function evenly(stops: number, dueMinutes: readonly number[]): Predictions {
  return Array.from({ length: stops }, (_, stop) =>
    dueMinutes.map((minutes, index) => ({ stop, minutes, bus: `YX${stop}-${index}` })),
  ).flat();
}

function arrivals(predictions: Predictions, route = '207') {
  return predictions.map((p) => ({
    id: String(p.stop),
    vehicleId: p.bus,
    naptanId: `stop-${p.stop}`,
    platformName: 'A',
    direction: 'outbound',
    lineId: route.toLowerCase(),
    modeName: 'bus',
    timeToStation: Math.round(p.minutes * 60),
    expectedArrival: '2026-11-10T14:05:00Z',
  }));
}

interface Scenario {
  routesBody?: unknown;
  predictions?: Predictions;
  status?: Response;
  arrivalsResponse?: () => Response;
  routesResponse?: () => Response;
}

function setup(initial: Scenario = {}) {
  const scenario: Scenario = initial;
  const time = clock();
  const kv = memoryKv();
  const { log, lines } = collectLogs();
  const { fetch, calls } = fakeFetch((url) => {
    const path = url.pathname;
    if (path === '/Line/Mode/bus') {
      return scenario.routesResponse?.() ?? json(scenario.routesBody ?? ROUTES);
    }
    if (path.endsWith('/Status')) {
      return scenario.status ?? json(statusBody(['207']));
    }
    if (path.endsWith('/Arrivals')) {
      return (
        scenario.arrivalsResponse?.() ??
        json(arrivals(scenario.predictions ?? evenly(40, [3, 9, 15])))
      );
    }
    return new Response('not found', { status: 404 });
  });
  const summaries = (): ArrivalSummary[] =>
    ['bakerloo', 'central', 'jubilee', 'northern', 'victoria'].map((lineId) => ({
      lineId: lineId as ArrivalSummary['lineId'],
      fetchedAt: time.now().toISOString(),
      predictionCount: 200,
      vehicles15: 30,
      vehicles30: 40,
      inbound15: 15,
      outbound15: 15,
      headwaySec: 300,
      platformsMeasured: 40,
      longWaitPlatforms: 0,
    }));
  const service = createBusService({
    upstream: upstreamOptions(fetch, log, { maxAttempts: 1 }),
    kv,
    summaries,
    log,
    now: time.now,
  });
  const arrivalCalls = () => calls.filter((url) => url.pathname.endsWith('/Arrivals'));
  return { service, scenario, time, kv, calls, lines, arrivalCalls };
}

function ok(outcome: BusOutcome) {
  if (outcome.kind !== 'ok') throw new Error(`expected ok, got ${outcome.kind}`);
  return outcome.result;
}

describe('createBusService', () => {
  it('returns a verdict for a known route, from the real engine', async () => {
    const { service } = setup();
    const result = ok(await service.check('207'));
    expect(busResultSchema.safeParse(result).success).toBe(true);
    expect(result).toMatchObject({
      route: '207',
      name: '207',
      stale: false,
      verdict: { outcome: 'match', ruleId: 'in-step' },
    });
  });

  it('raises long waits on a big route where many stops have nothing for 20 minutes', async () => {
    const waiting = evenly(20, [24]);
    const running = evenly(20, [3, 9]).map((p) => ({ ...p, stop: p.stop + 20 }));
    const { service } = setup({ predictions: [...waiting, ...running] });
    const result = ok(await service.check('207'));
    expect(result.verdict).toMatchObject({ outcome: 'mismatch', ruleId: 'long-waits' });
  });

  it('copes with a large payload of several hundred predictions across 90 stops', async () => {
    const { service } = setup({ predictions: evenly(90, [2, 6, 11, 17]) });
    const result = ok(await service.check('207'));
    expect(result.verdict.observed).toMatchObject({ platformsMeasured: 90 });
  });

  it('leaves a night route unknown', async () => {
    const { service } = setup();
    const result = ok(await service.check('N207'));
    expect(result.verdict).toMatchObject({
      outcome: 'unknown',
      ruleId: 'not-measurable',
    });
  });

  describe('unknown routes', () => {
    it('answers not found without asking TfL about the route', async () => {
      const { service, calls, arrivalCalls } = setup();
      expect(await service.check('ZZZZ')).toEqual({ kind: 'not_found' });
      expect(arrivalCalls()).toHaveLength(0);
      expect(calls.map((url) => url.pathname)).toEqual(['/Line/Mode/bus']);
    });
  });

  describe('the route list', () => {
    it('is fetched once and reused for other routes', async () => {
      const { service, calls } = setup();
      await service.check('207');
      await service.check('W11');
      expect(calls.filter((url) => url.pathname === '/Line/Mode/bus')).toHaveLength(1);
    });

    it('is refreshed once it is a day old', async () => {
      const { service, calls, time } = setup();
      await service.check('207');
      time.advance(BUS_ROUTES_MAX_AGE_SECONDS + 1);
      await service.check('W11');
      expect(calls.filter((url) => url.pathname === '/Line/Mode/bus')).toHaveLength(2);
    });

    it('keeps only ids and names, upper cased', async () => {
      const { service, kv } = setup({
        routesBody: [
          { id: '207', name: '207', lineStatuses: [], routeSections: [{ big: 'x' }] },
          { id: 'not a route', name: 'bad' },
          { id: 'w11', name: 'W11', crowding: {} },
          { nope: true },
        ],
      });
      await service.check('207');
      const stored = kv.data.get('bus-routes') as { routes: unknown[] };
      expect(stored.routes).toEqual([
        { id: '207', name: '207' },
        { id: 'W11', name: 'W11' },
      ]);
    });

    it('keeps serving from an old list when a refresh fails', async () => {
      const { service, scenario, time } = setup();
      await service.check('207');
      time.advance(BUS_ROUTES_MAX_AGE_SECONDS + 1);
      scenario.routesResponse = () => new Response('down', { status: 503 });
      expect(await service.check('W11')).toMatchObject({ kind: 'ok' });
    });

    it('is unavailable when there is no list and TfL cannot give one', async () => {
      const { service } = setup({
        routesResponse: () => new Response('down', { status: 503 }),
      });
      expect(await service.check('207')).toEqual({ kind: 'unavailable' });
    });

    it('is unavailable when the list holds nothing readable', async () => {
      const { service } = setup({ routesBody: [{ nope: true }] });
      expect(await service.check('207')).toEqual({ kind: 'unavailable' });
    });
  });

  describe('the cache', () => {
    it('reuses a result for 45 seconds without asking TfL again', async () => {
      const { service, arrivalCalls, time } = setup();
      const first = ok(await service.check('207'));
      time.advance(BUS_CACHE_SECONDS - 1);
      const second = ok(await service.check('207'));
      expect(arrivalCalls()).toHaveLength(1);
      expect(second.checkedAt).toBe(first.checkedAt);
    });

    it('fetches again once the result is older than that', async () => {
      const { service, arrivalCalls, time } = setup();
      await service.check('207');
      time.advance(BUS_CACHE_SECONDS + 1);
      const second = ok(await service.check('207'));
      expect(arrivalCalls()).toHaveLength(2);
      expect(second.checkedAt).toBe(time.now().toISOString());
    });
  });

  describe('coalescing', () => {
    it('shares one fetch between concurrent checks of one route', async () => {
      const { service, arrivalCalls } = setup();
      const all = await Promise.all([
        service.check('207'),
        service.check('207'),
        service.check('207'),
      ]);
      expect(arrivalCalls()).toHaveLength(1);
      expect(all.every((o) => o.kind === 'ok')).toBe(true);
    });

    it('does not share a fetch between different routes', async () => {
      const { service, arrivalCalls } = setup();
      await Promise.all([service.check('207'), service.check('W11')]);
      expect(arrivalCalls()).toHaveLength(2);
    });
  });

  describe('the request budget', () => {
    it('stops fetching once the minute is spent and says when to try again', async () => {
      const { service, arrivalCalls } = setup();
      // One request for the route list, then two per route.
      const affordable = Math.floor((BUS_REQUESTS_PER_MINUTE - 1) / 2);
      const routes = ROUTES.slice(3, 3 + affordable + 1).map((r) => r.id.toUpperCase());

      const outcomes: BusOutcome[] = [];
      for (const route of routes) outcomes.push(await service.check(route));

      expect(arrivalCalls()).toHaveLength(affordable);
      const last = outcomes[outcomes.length - 1];
      expect(last).toMatchObject({ kind: 'busy' });
      expect(last?.kind === 'busy' && last.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    });

    it('never makes more TfL requests in a minute than the budget, however many routes are searched', async () => {
      const { service, calls } = setup();
      await Promise.all(
        ROUTES.slice(0, 200).map((r) => service.check(r.id.toUpperCase())),
      );
      expect(calls.length).toBeLessThanOrEqual(BUS_REQUESTS_PER_MINUTE);
    });

    it('opens again once the minute has passed', async () => {
      const { service, time } = setup();
      const routes = ROUTES.slice(3, 70).map((r) => r.id.toUpperCase());
      for (const route of routes) await service.check(route);
      expect(await service.check('R70')).toMatchObject({ kind: 'busy' });
      time.advance(61);
      expect(await service.check('R70')).toMatchObject({ kind: 'ok' });
    });

    it('serves the earlier result, marked stale, when the budget is spent', async () => {
      const { service, time } = setup();
      const first = ok(await service.check('207'));
      const others = ROUTES.slice(3, 3 + 58).map((r) => r.id.toUpperCase());
      for (const route of others) await service.check(route);
      time.advance(BUS_CACHE_SECONDS + 1);

      const again = ok(await service.check('207'));
      expect(again.stale).toBe(true);
      expect(again.checkedAt).toBe(first.checkedAt);
    });
  });

  describe('upstream failure', () => {
    it('serves the last good result, marked stale, when TfL fails', async () => {
      const { service, scenario, time } = setup();
      const first = ok(await service.check('207'));
      time.advance(BUS_CACHE_SECONDS + 1);
      scenario.arrivalsResponse = () => new Response('down', { status: 503 });

      const again = ok(await service.check('207'));
      expect(again).toMatchObject({ stale: true, checkedAt: first.checkedAt });
    });

    it('is unavailable when TfL fails and there is nothing earlier', async () => {
      const { service } = setup({
        arrivalsResponse: () => new Response('down', { status: 503 }),
      });
      expect(await service.check('207')).toEqual({ kind: 'unavailable' });
    });

    it.each([
      ['arrivals that are not a list', () => json({ nope: true })],
      ['arrivals with nothing readable', () => json([{ timeToStation: 'soon' }])],
    ])('is unavailable for %s', async (_name, arrivalsResponse) => {
      const { service } = setup({ arrivalsResponse });
      expect(await service.check('207')).toEqual({ kind: 'unavailable' });
    });

    it('is unavailable when the status holds no readable status', async () => {
      const { service } = setup({ status: json([{ id: '207', lineStatuses: [] }]) });
      expect(await service.check('207')).toEqual({ kind: 'unavailable' });
    });

    it('drops malformed predictions, keeps the rest and logs the count', async () => {
      const { service, lines } = setup({
        arrivalsResponse: () =>
          json([...arrivals(evenly(40, [3, 9])), { timeToStation: 'x' }]),
      });
      expect(await service.check('207')).toMatchObject({ kind: 'ok' });
      expect(lines.some((l) => l.includes('predictions_dropped'))).toBe(true);
    });

    it('treats a route with no buses as a valid answer, not a failure', async () => {
      const { service } = setup({ predictions: [] });
      const result = ok(await service.check('207'));
      expect(result.verdict).toMatchObject({
        outcome: 'unknown',
        ruleId: 'not-measurable',
      });
    });
  });

  describe('no buses', () => {
    it('is a mismatch when a route that had buses goes silent inside the window', async () => {
      const { service, scenario, time } = setup();
      ok(await service.check('207'));
      time.advance(10 * 60);
      scenario.predictions = [];
      const result = ok(await service.check('207'));
      expect(result.verdict).toMatchObject({ outcome: 'mismatch', ruleId: 'no-buses' });
    });

    it('stays unknown when no earlier reading showed buses on the route', async () => {
      const { service } = setup({ predictions: [] });
      const result = ok(await service.check('207'));
      expect(result.verdict.outcome).toBe('unknown');
    });

    it('remembers when buses were last seen across empty readings', async () => {
      const { service, scenario, time } = setup();
      ok(await service.check('207'));
      scenario.predictions = [];
      time.advance(60);
      ok(await service.check('207'));
      time.advance(60);
      const third = ok(await service.check('207'));
      expect(third.verdict.ruleId).toBe('no-buses');
      expect(third.verdict.reason).toContain('2 minutes ago');
    });
  });

  describe('memory', () => {
    it('remembers at most 200 routes, dropping the least recently used', async () => {
      const { service, kv, time } = setup();
      const routes = ROUTES.slice(3, 3 + BUS_MAX_ROUTES + 5).map((r) =>
        r.id.toUpperCase(),
      );
      for (const [index, route] of routes.entries()) {
        await service.check(route);
        if (index % 40 === 39) time.advance(61);
      }
      const index = kv.data.get('bus-index') as string[];
      expect(index).toHaveLength(BUS_MAX_ROUTES);
      expect(kv.data.has(`bus:${routes[0] ?? ''}`)).toBe(false);
      expect(kv.data.has(`bus:${routes[routes.length - 1] ?? ''}`)).toBe(true);
      const entries = [...kv.data.keys()].filter((key) => key.startsWith('bus:'));
      expect(entries).toHaveLength(BUS_MAX_ROUTES);
    });

    it('moves a route to the front when it is checked again', async () => {
      const { service, kv, time } = setup();
      await service.check('207');
      await service.check('W11');
      time.advance(BUS_CACHE_SECONDS + 1);
      await service.check('207');
      expect((kv.data.get('bus-index') as string[]).slice(0, 2)).toEqual(['207', 'W11']);
    });

    it('ignores a stored entry that no longer matches the schema', async () => {
      const { service, kv } = setup();
      kv.data.set('bus:207', { result: 'garbage' });
      expect(await service.check('207')).toMatchObject({ kind: 'ok' });
    });
  });

  describe('the key', () => {
    it('never appears in a result or a log line, on success or failure', async () => {
      const ok1 = setup();
      const success = JSON.stringify(await ok1.service.check('207'));
      const bad = setup({ arrivalsResponse: () => new Response(KEY, { status: 503 }) });
      const failure = JSON.stringify(await bad.service.check('207'));
      const spent = setup();
      for (const route of ROUTES.slice(3, 70))
        await spent.service.check(route.id.toUpperCase());

      const everything = [
        success,
        failure,
        ...ok1.lines,
        ...bad.lines,
        ...spent.lines,
      ].join('\n');
      expect(everything).not.toContain(KEY);
      expect(bad.lines.length).toBeGreaterThan(0);
    });
  });
});

describe('RequestBudget', () => {
  function budget(limit: number) {
    let at = 0;
    return {
      budget: new RequestBudget(limit, 60_000, () => at),
      advance: (ms: number) => {
        at += ms;
      },
    };
  }

  it('allows requests up to the limit and refuses the next', () => {
    const { budget: b } = budget(5);
    expect(b.take(2)).toBe(true);
    expect(b.take(3)).toBe(true);
    expect(b.take(1)).toBe(false);
  });

  it('refuses a request that would pass the limit without spending any', () => {
    const { budget: b } = budget(5);
    expect(b.take(4)).toBe(true);
    expect(b.take(2)).toBe(false);
    expect(b.take(1)).toBe(true);
  });

  it('frees requests as the window rolls past them', () => {
    const { budget: b, advance } = budget(2);
    expect(b.take(2)).toBe(true);
    advance(59_999);
    expect(b.take(1)).toBe(false);
    advance(2);
    expect(b.take(2)).toBe(true);
  });

  it('says how long until a request is allowed again, at least a second', () => {
    const { budget: b, advance } = budget(1);
    expect(b.retryAfterSeconds()).toBe(1);
    b.take(1);
    advance(10_000);
    expect(b.retryAfterSeconds()).toBe(50);
    advance(49_900);
    expect(b.retryAfterSeconds()).toBe(1);
  });
});
