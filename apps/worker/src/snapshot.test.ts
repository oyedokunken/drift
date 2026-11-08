import { describe, expect, it } from 'vitest';
import { snapshotSchema, type ArrivalSummary } from '@drift/shared';
import {
  KEY,
  collectLogs,
  fakeFetch,
  hang,
  json,
  memoryStore,
  statusBody,
  upstreamOptions,
} from '../test/helpers.ts';
import { createSnapshotService } from './snapshot.ts';

const NOW = new Date('2026-11-08T09:00:00Z');

function summary(
  lineId: ArrivalSummary['lineId'],
  overrides: Partial<ArrivalSummary> = {},
) {
  return {
    lineId,
    fetchedAt: new Date(NOW.getTime() - 30_000).toISOString(),
    predictionCount: 100,
    vehicles15: 20,
    vehicles30: 25,
    inbound15: 10,
    outbound15: 10,
    headwaySec: 300,
    platformsMeasured: 20,
    ...overrides,
  };
}

function setup(handler: Parameters<typeof fakeFetch>[0]) {
  const { fetch, calls } = fakeFetch(handler);
  const { log, lines } = collectLogs();
  const store = memoryStore();
  const upstream = upstreamOptions(fetch, log, { maxAttempts: 2 });
  const service = createSnapshotService({ upstream, store, log, now: () => NOW });
  return { service, store, calls, lines };
}

describe('snapshot service', () => {
  it('builds a fresh, valid snapshot from live status and stored summaries', async () => {
    const { service, store } = setup(() => json(statusBody(['central', 'victoria'])));
    store.summaries.set('central', summary('central'));
    store.summaries.set(
      'victoria',
      summary('victoria', { fetchedAt: '2026-11-08T08:58:00.000Z' }),
    );

    const result = await service.get();

    expect(result.kind).toBe('fresh');
    if (result.kind !== 'fresh') return;
    expect(snapshotSchema.safeParse(result.snapshot).success).toBe(true);
    expect(result.snapshot).toMatchObject({
      generatedAt: NOW.toISOString(),
      statusAsOf: NOW.toISOString(),
      arrivalsAsOf: '2026-11-08T08:58:00.000Z',
      stale: false,
    });
    expect(result.snapshot.verdicts.map((v) => [v.lineId, v.outcome])).toEqual([
      ['central', 'match'],
      ['victoria', 'match'],
    ]);
  });

  it('saves each fresh snapshot as the last known good', async () => {
    const { service, store } = setup(() => json(statusBody(['central'])));
    await service.get();
    expect(store.snapshot?.generatedAt).toBe(NOW.toISOString());
  });

  it('reports unknown, not a mismatch, for lines with no summaries yet', async () => {
    const { service } = setup(() => json(statusBody(['central'])));
    const result = await service.get();
    expect(result.kind === 'fresh' && result.snapshot.verdicts[0]).toMatchObject({
      outcome: 'unknown',
      ruleId: 'no-arrivals',
    });
    expect(result.kind === 'fresh' && result.snapshot.arrivalsAsOf).toBeNull();
  });

  it('still builds when stored summaries cannot be read', async () => {
    const { service, store, lines } = setup(() => json(statusBody(['central'])));
    store.failLoadSummaries = true;
    const result = await service.get();
    expect(result.kind).toBe('fresh');
    expect(lines.some((l) => l.includes('summaries_unreadable'))).toBe(true);
  });

  it('still returns a fresh snapshot when saving it fails', async () => {
    const { service, store, lines } = setup(() => json(statusBody(['central'])));
    store.failSaveSnapshot = true;
    expect((await service.get()).kind).toBe('fresh');
    expect(lines.some((l) => l.includes('snapshot_not_saved'))).toBe(true);
  });

  describe('when TfL is down', () => {
    it('serves the last good snapshot marked stale', async () => {
      const ok = setup(() => json(statusBody(['central'])));
      const first = await ok.service.get();
      if (first.kind !== 'fresh') throw new Error('expected a fresh snapshot');

      const down = setup(() => new Response('down', { status: 503 }));
      down.store.snapshot = first.snapshot;
      const result = await down.service.get();

      expect(result.kind).toBe('stale');
      if (result.kind !== 'stale') return;
      expect(result.snapshot.stale).toBe(true);
      expect(result.snapshot.generatedAt).toBe(first.snapshot.generatedAt);
      expect(result.snapshot.verdicts).toEqual(first.snapshot.verdicts);
    });

    it('is unavailable when there is no earlier snapshot', async () => {
      const { service } = setup(() => new Response('down', { status: 503 }));
      expect((await service.get()).kind).toBe('unavailable');
    });

    it('is unavailable when the earlier snapshot cannot be read either', async () => {
      const { service, store } = setup(() => new Response('down', { status: 503 }));
      store.failLoadSnapshot = true;
      expect((await service.get()).kind).toBe('unavailable');
    });

    it('treats a timeout like any other outage', async () => {
      const { fetch } = fakeFetch((_url, init) => hang(init));
      const { log } = collectLogs();
      const store = memoryStore();
      const service = createSnapshotService({
        upstream: upstreamOptions(fetch, log, { timeoutMs: 10, maxAttempts: 1 }),
        store,
        log,
        now: () => NOW,
      });
      expect((await service.get()).kind).toBe('unavailable');
    });

    it('treats a schema failure as an outage', async () => {
      const { service } = setup(() => json({ unexpected: 'shape' }));
      expect((await service.get()).kind).toBe('unavailable');
    });

    it('recovers on the next call once TfL is back', async () => {
      let healthy = false;
      const { service } = setup(() =>
        healthy ? json(statusBody(['central'])) : new Response('down', { status: 500 }),
      );
      expect((await service.get()).kind).toBe('unavailable');
      healthy = true;
      expect((await service.get()).kind).toBe('fresh');
    });

    it('never logs the key', async () => {
      const { service, lines } = setup(() => new Response(`key ${KEY}`, { status: 500 }));
      await service.get();
      expect(lines.length).toBeGreaterThan(0);
      expect(lines.join('\n')).not.toContain(KEY);
    });
  });

  describe('coalescing', () => {
    it('shares one upstream call between concurrent requests', async () => {
      const { service, calls } = setup(() => json(statusBody(['central'])));
      const results = await Promise.all(Array.from({ length: 25 }, () => service.get()));
      expect(calls).toHaveLength(1);
      expect(new Set(results).size).toBe(1);
    });

    it('starts a new build once the previous one has finished', async () => {
      const { service, calls } = setup(() => json(statusBody(['central'])));
      await service.get();
      await service.get();
      expect(calls).toHaveLength(2);
    });

    it('lets the next call retry after a failed build', async () => {
      let n = 0;
      const { service, calls } = setup(() =>
        ++n <= 2 ? new Response('down', { status: 500 }) : json(statusBody(['central'])),
      );
      expect((await service.get()).kind).toBe('unavailable');
      expect((await service.get()).kind).toBe('fresh');
      expect(calls.length).toBeGreaterThan(1);
    });
  });
});
