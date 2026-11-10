import { describe, expect, it } from 'vitest';
import { LINE_IDS } from '@drift/shared';
import {
  collectLogs,
  fakeFetch,
  json,
  memoryStore,
  tflPrediction,
  upstreamOptions,
} from '../test/helpers.ts';
import { refreshSummaries } from './refresh.ts';
import { LINE_GROUPS, REFRESH_PHASES } from './tfl.ts';

const NOW = new Date('2026-11-08T09:00:00Z');

/** Predictions for whichever lines the request names, three trains each. */
function arrivalsFor(url: URL): unknown[] {
  const lines = url.pathname.split('/')[2]?.split(',') ?? [];
  return lines.flatMap((lineId) =>
    ['a', 'b', 'c'].map((vehicleId) =>
      tflPrediction({ lineId, vehicleId: `${lineId}-${vehicleId}`, timeToStation: 100 }),
    ),
  );
}

function setup(handler: (url: URL) => Response) {
  const { fetch, calls } = fakeFetch(handler);
  const { log, lines } = collectLogs();
  const store = memoryStore();
  const upstream = upstreamOptions(fetch, log, { maxAttempts: 1 });
  return { deps: { upstream, store, log, now: () => NOW }, store, calls, lines };
}

describe('refreshSummaries', () => {
  it('fetches every group and stores one summary per line', async () => {
    const { deps, store, calls } = setup((url) => json(arrivalsFor(url)));
    const report = await refreshSummaries(deps);

    expect(calls).toHaveLength(LINE_GROUPS.length);
    expect([...store.summaries.keys()].sort()).toEqual([...LINE_IDS].sort());
    expect(report.failed).toEqual([]);
    expect(report.refreshed).toHaveLength(LINE_IDS.length);
    expect(store.summaries.get('central')).toMatchObject({
      vehicles15: 3,
      fetchedAt: NOW.toISOString(),
    });
  });

  it('keeps the other groups when one group fails, and leaves the failed ones untouched', async () => {
    const { deps, store } = setup((url) =>
      url.pathname.includes('northern')
        ? new Response('down', { status: 503 })
        : json(arrivalsFor(url)),
    );
    const earlier = {
      lineId: 'northern' as const,
      fetchedAt: '2026-11-08T08:50:00.000Z',
      predictionCount: 9,
      vehicles15: 9,
      vehicles30: 9,
      inbound15: 4,
      outbound15: 5,
      headwaySec: 200,
      platformsMeasured: 30,
      longWaitPlatforms: 0,
    };
    store.summaries.set('northern', earlier);

    const report = await refreshSummaries(deps);

    expect(report.failed).toEqual(['northern']);
    expect(store.summaries.get('northern')).toEqual(earlier);
    expect(store.summaries.get('victoria')?.fetchedAt).toBe(NOW.toISOString());
  });

  it('stores nothing when every group fails', async () => {
    const { deps, store } = setup(() => new Response('down', { status: 500 }));
    const report = await refreshSummaries(deps);
    expect(store.summaries.size).toBe(0);
    expect(report.refreshed).toEqual([]);
    expect(report.failed).toHaveLength(LINE_IDS.length);
  });

  it('records an empty feed as a summary with no predictions, not as a failure', async () => {
    const { deps, store } = setup(() => json([]));
    const report = await refreshSummaries(deps);
    expect(report.failed).toEqual([]);
    expect(store.summaries.get('central')).toMatchObject({
      predictionCount: 0,
      vehicles30: 0,
    });
  });

  it('treats an unreadable response as a failed group', async () => {
    const { deps, store } = setup((url) =>
      url.pathname.includes('central') ? json({ nope: true }) : json(arrivalsFor(url)),
    );
    const report = await refreshSummaries(deps);
    expect([...report.failed].sort()).toEqual(['bakerloo', 'central']);
    expect(store.summaries.has('central')).toBe(false);
  });

  it('logs failures with the reason', async () => {
    const { deps, lines } = setup(() => new Response('down', { status: 500 }));
    await refreshSummaries(deps);
    expect(lines.filter((l) => l.includes('group_refresh_failed'))).toHaveLength(
      LINE_GROUPS.length,
    );
  });

  it('refreshes only the lines of the groups it is given', async () => {
    const { deps, store, calls } = setup((url) => json(arrivalsFor(url)));
    const phase = REFRESH_PHASES[1] ?? [];
    const report = await refreshSummaries(deps, phase);

    expect(calls).toHaveLength(phase.length);
    expect([...store.summaries.keys()].sort()).toEqual([...phase.flat()].sort());
    expect(report.failed).toEqual([]);
  });
});
