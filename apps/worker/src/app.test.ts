import { describe, expect, it } from 'vitest';
import { apiErrorSchema, snapshotSchema, type ArrivalSummary } from '@drift/shared';
import {
  KEY,
  collectLogs,
  fakeFetch,
  json,
  memoryStore,
  statusBody,
  upstreamOptions,
} from '../test/helpers.ts';
import { createApp, type CacheLike } from './app.ts';
import { createSnapshotService } from './snapshot.ts';

const NOW = new Date('2026-11-08T09:00:00Z');

function memoryCache(): CacheLike & { entries: Map<string, Response> } {
  const entries = new Map<string, Response>();
  return {
    entries,
    match: (request) => Promise.resolve(entries.get(request.url)?.clone()),
    put: (request, response) => {
      entries.set(request.url, response);
      return Promise.resolve();
    },
  };
}

function setup(status: () => Response) {
  const { fetch, calls } = fakeFetch(status);
  const { log, lines } = collectLogs();
  const store = memoryStore();
  const cache = memoryCache();
  const snapshot = createSnapshotService({
    upstream: upstreamOptions(fetch, log, { maxAttempts: 1 }),
    store,
    log,
    now: () => NOW,
  });
  const assetCalls: string[] = [];
  const app = createApp({
    now: () => NOW,
    snapshot,
    bus: () => Promise.resolve({ kind: 'unavailable' }),
    cache,
    assets: (request) => {
      assetCalls.push(new URL(request.url).pathname);
      const isHtml = new URL(request.url).pathname === '/';
      return Promise.resolve(
        new Response(isHtml ? '<html></html>' : 'asset', {
          headers: { 'Content-Type': isHtml ? 'text/html' : 'application/octet-stream' },
        }),
      );
    },
  });
  const get = (path: string, method = 'GET') =>
    app(new Request(`https://drift.test${path}`, { method }));
  return { get, store, cache, calls, lines, assetCalls };
}

const healthy = () => json(statusBody(['central']));
const down = () => new Response(`upstream said ${KEY}`, { status: 503 });

describe('API routes', () => {
  it('serves a valid snapshot', async () => {
    const { get, store } = setup(healthy);
    store.summaries.set('central', {
      lineId: 'central',
      fetchedAt: '2026-11-08T08:59:30.000Z',
      predictionCount: 50,
      vehicles15: 20,
      vehicles30: 25,
      inbound15: 10,
      outbound15: 10,
      headwaySec: 300,
      platformsMeasured: 20,
      longWaitPlatforms: 0,
    } satisfies ArrivalSummary);
    const response = await get('/api/snapshot');
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('application/json');
    const body = snapshotSchema.parse(await response.json());
    expect(body.verdicts[0]).toMatchObject({ lineId: 'central', outcome: 'match' });
  });

  it('answers the health check without touching TfL', async () => {
    const { get, calls } = setup(healthy);
    const response = await get('/api/health');
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(calls).toHaveLength(0);
  });

  it('returns a typed 404 for an unknown API route', async () => {
    const { get } = setup(healthy);
    const response = await get('/api/nope');
    expect(response.status).toBe(404);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe('not_found');
  });

  it.each(['POST', 'PUT', 'DELETE'])('returns a typed 405 for %s', async (method) => {
    const { get } = setup(healthy);
    const response = await get('/api/snapshot', method);
    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('GET');
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe(
      'method_not_allowed',
    );
  });
});

describe('server time', () => {
  it('stamps every snapshot response with the Worker clock, cached or not', async () => {
    const { get } = setup(healthy);
    const first = await get('/api/snapshot');
    const second = await get('/api/snapshot');
    expect(first.headers.get('X-Server-Time')).toBe(NOW.toISOString());
    expect(second.headers.get('X-Server-Time')).toBe(NOW.toISOString());
  });

  it('also stamps a stale fallback', async () => {
    let up = true;
    const { get, cache } = setup(() => (up ? healthy() : down()));
    await get('/api/snapshot');
    cache.entries.clear();
    up = false;
    expect((await get('/api/snapshot')).headers.get('X-Server-Time')).toBe(
      NOW.toISOString(),
    );
  });
});

describe('caching and repeated calls', () => {
  it('serves repeat requests from the cache without another upstream call', async () => {
    const { get, calls } = setup(healthy);
    await get('/api/snapshot');
    await get('/api/snapshot');
    await get('/api/snapshot');
    expect(calls).toHaveLength(1);
  });

  it('keeps a cached copy for 45 seconds', async () => {
    const { get, cache } = setup(healthy);
    await get('/api/snapshot');
    const stored = [...cache.entries.values()][0];
    expect(stored?.headers.get('Cache-Control')).toBe('public, max-age=45');
  });

  it('gives browsers a short, deliberate cache policy', async () => {
    const { get } = setup(healthy);
    expect((await get('/api/snapshot')).headers.get('Cache-Control')).toBe(
      'public, max-age=15',
    );
  });

  it('shares one upstream call between simultaneous visitors', async () => {
    const { get, calls } = setup(healthy);
    await Promise.all(Array.from({ length: 20 }, () => get('/api/snapshot')));
    expect(calls).toHaveLength(1);
  });

  it('does not cache a stale fallback, so recovery is picked up next time', async () => {
    let up = true;
    const { get, store, cache } = setup(() => (up ? healthy() : down()));
    await get('/api/snapshot');
    cache.entries.clear();
    up = false;

    const response = await get('/api/snapshot');
    const body = snapshotSchema.parse(await response.json());
    expect(body.stale).toBe(true);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(cache.entries.size).toBe(0);
    expect(store.snapshot?.stale).toBe(false);

    up = true;
    expect(snapshotSchema.parse(await (await get('/api/snapshot')).json()).stale).toBe(
      false,
    );
  });
});

describe('outages', () => {
  it('returns a typed 503 with Retry-After when there is nothing to show', async () => {
    const { get } = setup(down);
    const response = await get('/api/snapshot');
    expect(response.status).toBe(503);
    expect(response.headers.get('Retry-After')).toBe('30');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe(
      'upstream_unavailable',
    );
  });

  it('never answers with a bare 500 whatever the upstream does', async () => {
    for (const failure of [
      () => new Response('x', { status: 500 }),
      () => new Response('x', { status: 429 }),
      () => json({ garbage: true }),
      () => new Response('not json', { status: 200 }),
    ]) {
      const { get } = setup(failure);
      const response = await get('/api/snapshot');
      expect(response.status).toBe(503);
      expect(apiErrorSchema.safeParse(await response.json()).success).toBe(true);
    }
  });
});

describe('security headers', () => {
  const required = [
    'Content-Security-Policy',
    'X-Content-Type-Options',
    'Referrer-Policy',
    'Permissions-Policy',
    'Strict-Transport-Security',
  ];

  it.each([
    ['a snapshot', '/api/snapshot'],
    ['the health check', '/api/health'],
    ['an API 404', '/api/missing'],
    ['the app shell', '/'],
    ['a fingerprinted asset', '/assets/index-abc123.js'],
    ['an icon', '/favicon.svg'],
  ])('are present on %s', async (_name, path) => {
    const { get } = setup(healthy);
    const response = await get(path);
    for (const header of required) expect(response.headers.get(header)).toBeTruthy();
  });

  it('are present on a 503', async () => {
    const { get } = setup(down);
    const response = await get('/api/snapshot');
    for (const header of required) expect(response.headers.get(header)).toBeTruthy();
  });

  it('only allow the app to load its own resources', async () => {
    const { get } = setup(healthy);
    const csp = (await get('/')).headers.get('Content-Security-Policy') ?? '';
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).not.toContain('unsafe-eval');
  });
});

describe('static assets', () => {
  it.each([
    ['the HTML shell', '/', 'no-cache'],
    [
      'a fingerprinted asset',
      '/assets/index-abc123.js',
      'public, max-age=31536000, immutable',
    ],
    ['an icon', '/favicon.svg', 'public, max-age=86400'],
  ])('sets the cache policy for %s', async (_name, path, expected) => {
    const { get, assetCalls } = setup(healthy);
    const response = await get(path);
    expect(response.headers.get('Cache-Control')).toBe(expected);
    expect(assetCalls).toEqual([path]);
  });
});

describe('the key never leaves the Worker', () => {
  it('is absent from every response and every log across success, stale and outage', async () => {
    const outputs: string[] = [];
    let mode: 'up' | 'down' = 'up';
    const { get, cache, lines } = setup(() => (mode === 'up' ? healthy() : down()));

    const collect = async (path: string) => {
      const response = await get(path);
      outputs.push(
        JSON.stringify([...response.headers.entries()]),
        await response.text(),
        String(response.status),
      );
    };

    await collect('/api/snapshot');
    await collect('/api/health');
    await collect('/api/nope');
    cache.entries.clear();
    mode = 'down';
    await collect('/api/snapshot');
    await collect('/');

    expect(outputs.join('\n')).not.toContain(KEY);
    expect(outputs.join('\n')).not.toContain('app_key');
    expect(lines.join('\n')).not.toContain(KEY);
    expect(lines.length).toBeGreaterThan(0);
  });
});
