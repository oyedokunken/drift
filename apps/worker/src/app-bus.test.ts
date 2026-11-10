import { describe, expect, it, vi } from 'vitest';
import { apiErrorSchema, busResultSchema } from '@drift/shared';
import { createApp } from './app.ts';
import type { BusOutcome } from './bus.ts';

const NOW = new Date('2026-11-10T14:00:00Z');

const RESULT = {
  route: '207',
  name: '207',
  checkedAt: '2026-11-10T13:59:30.000Z',
  stale: false,
  verdict: {
    official: { severity: 10, label: 'Good Service' },
    observed: null,
    outcome: 'unknown' as const,
    ruleId: 'not-measurable' as const,
    reason: 'Only 3 stops have a bus due, too few to judge this route from one reading.',
    confidence: 'low' as const,
  },
};

function setup(outcome: BusOutcome = { kind: 'ok', result: RESULT }) {
  const bus = vi.fn<(route: string) => Promise<BusOutcome>>(() =>
    Promise.resolve(outcome),
  );
  const app = createApp({
    now: () => NOW,
    snapshot: { get: () => Promise.resolve({ kind: 'unavailable' }) },
    bus,
    cache: { match: () => Promise.resolve(undefined), put: () => Promise.resolve() },
    assets: () => Promise.resolve(new Response('asset')),
  });
  const get = (path: string, method = 'GET') =>
    app(new Request(`https://drift.test${path}`, { method }));
  return { get, bus };
}

describe('GET /api/bus/:route', () => {
  it('returns the result for a valid route, with the server time and no caching', async () => {
    const { get, bus } = setup();
    const response = await get('/api/bus/207');
    expect(response.status).toBe(200);
    expect(busResultSchema.safeParse(await response.json()).success).toBe(true);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('X-Server-Time')).toBe(NOW.toISOString());
    expect(response.headers.get('Content-Security-Policy')).toContain(
      "default-src 'self'",
    );
    expect(bus).toHaveBeenCalledWith('207');
  });

  it.each([
    ['w11', 'W11'],
    ['n207', 'N207'],
    ['%20x26%20', 'X26'],
    ['Ab1', 'AB1'],
  ])('normalises %s to %s before asking', async (raw, expected) => {
    const { get, bus } = setup();
    expect((await get(`/api/bus/${raw}`)).status).toBe(200);
    expect(bus).toHaveBeenCalledWith(expected);
  });

  describe('invalid input', () => {
    it.each([
      ['an empty route', '/api/bus/'],
      ['a route that is too long', '/api/bus/12345'],
      ['a space inside', '/api/bus/20%207'],
      ['a dash', '/api/bus/a-b'],
      ['markup', '/api/bus/%3Cscript%3Ealert(1)%3C%2Fscript%3E'],
      ['a path traversal', '/api/bus/..%2F..%2Fsnapshot'],
      ['a semicolon', '/api/bus/207%3Bdrop'],
      ['a malformed escape', '/api/bus/%E0%A4%A'],
      ['a non ASCII letter', '/api/bus/%C3%A9%C3%A9'],
    ])('answers 400 with a typed error for %s, and asks nobody', async (_name, path) => {
      const { get, bus } = setup();
      const response = await get(path);
      expect(response.status).toBe(400);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe('invalid_route');
      expect(bus).not.toHaveBeenCalled();
    });

    it('never repeats what the visitor sent', async () => {
      const { get } = setup();
      const attack = '%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E';
      const response = await get(`/api/bus/${attack}`);
      const text = await response.text();
      expect(text).not.toContain('img');
      expect(text).not.toContain('onerror');
      expect(response.headers.get('Content-Type')).toContain('application/json');
    });
  });

  it('answers 404 for a path with more segments, without asking', async () => {
    const { get, bus } = setup();
    const response = await get('/api/bus/207/extra');
    expect(response.status).toBe(404);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe('not_found');
    expect(bus).not.toHaveBeenCalled();
  });

  it('answers 405 to a method other than GET', async () => {
    const { get, bus } = setup();
    const response = await get('/api/bus/207', 'POST');
    expect(response.status).toBe(405);
    expect(bus).not.toHaveBeenCalled();
  });

  describe('outcomes', () => {
    it('answers 404 route_not_found for an unknown route', async () => {
      const { get } = setup({ kind: 'not_found' });
      const response = await get('/api/bus/9999');
      expect(response.status).toBe(404);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe('route_not_found');
      expect(JSON.stringify(body)).not.toContain('9999');
    });

    it('answers 429 busy with Retry-After when the budget is spent', async () => {
      const { get } = setup({ kind: 'busy', retryAfterSeconds: 17 });
      const response = await get('/api/bus/207');
      expect(response.status).toBe(429);
      expect(response.headers.get('Retry-After')).toBe('17');
      expect(apiErrorSchema.parse(await response.json()).error.code).toBe('busy');
    });

    it('answers 503 with Retry-After when there is nothing to show, never a bare 500', async () => {
      const { get } = setup({ kind: 'unavailable' });
      const response = await get('/api/bus/207');
      expect(response.status).toBe(503);
      expect(response.headers.get('Retry-After')).toBe('30');
      expect(apiErrorSchema.parse(await response.json()).error.code).toBe(
        'upstream_unavailable',
      );
    });

    it('passes a stale result through as a 200 so the page can say so', async () => {
      const { get } = setup({ kind: 'ok', result: { ...RESULT, stale: true } });
      const body = busResultSchema.parse(await (await get('/api/bus/207')).json());
      expect(body.stale).toBe(true);
    });
  });
});
