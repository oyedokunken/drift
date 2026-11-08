import { describe, expect, it } from 'vitest';
import {
  KEY,
  collectLogs,
  fakeFetch,
  hang,
  json,
  upstreamOptions,
} from '../test/helpers.ts';
import { UpstreamError, fetchTflJson, parseRetryAfter } from './upstream.ts';

async function failureOf(promise: Promise<unknown>): Promise<UpstreamError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof UpstreamError) return error;
    throw error;
  }
  throw new Error('expected the call to fail');
}

describe('fetchTflJson', () => {
  it('returns parsed JSON and sends the key as app_key', async () => {
    const { fetch, calls } = fakeFetch(() => json([{ ok: true }]));
    const { log } = collectLogs();
    const result = await fetchTflJson(
      '/Line/Mode/tube/Status',
      upstreamOptions(fetch, log),
    );
    expect(result).toEqual([{ ok: true }]);
    expect(calls[0]?.pathname).toBe('/Line/Mode/tube/Status');
    expect(calls[0]?.searchParams.get('app_key')).toBe(KEY);
  });

  it('retries a 5xx and recovers', async () => {
    let n = 0;
    const { fetch, calls } = fakeFetch(() =>
      ++n < 3 ? new Response('no', { status: 503 }) : json({ ok: 1 }),
    );
    const { log, lines } = collectLogs();
    const options = upstreamOptions(fetch, log);
    expect(await fetchTflJson('/x', options)).toEqual({ ok: 1 });
    expect(calls).toHaveLength(3);
    expect(options.sleeps).toHaveLength(2);
    expect(lines.filter((l) => l.includes('upstream_retry'))).toHaveLength(2);
  });

  it('backs off exponentially', async () => {
    const { fetch } = fakeFetch(() => new Response('no', { status: 500 }));
    const { log } = collectLogs();
    const options = upstreamOptions(fetch, log, {
      random: () => 1,
      maxAttempts: 4,
      baseDelayMs: 100,
    });
    await failureOf(fetchTflJson('/x', options));
    expect(options.sleeps).toEqual([100, 200, 400]);
  });

  it('applies jitter between zero and the step', async () => {
    const { fetch } = fakeFetch(() => new Response('no', { status: 500 }));
    const { log } = collectLogs();
    const options = upstreamOptions(fetch, log, { random: () => 0.25, baseDelayMs: 100 });
    await failureOf(fetchTflJson('/x', options));
    expect(options.sleeps).toEqual([25, 50]);
  });

  it('honours Retry-After on a 429', async () => {
    let n = 0;
    const { fetch } = fakeFetch(() =>
      ++n === 1
        ? new Response('slow down', { status: 429, headers: { 'Retry-After': '2' } })
        : json({ ok: 1 }),
    );
    const { log } = collectLogs();
    const options = upstreamOptions(fetch, log);
    expect(await fetchTflJson('/x', options)).toEqual({ ok: 1 });
    expect(options.sleeps).toEqual([2000]);
  });

  it('caps a long Retry-After', async () => {
    let n = 0;
    const { fetch } = fakeFetch(() =>
      ++n === 1
        ? new Response('', { status: 429, headers: { 'Retry-After': '120' } })
        : json({}),
    );
    const { log } = collectLogs();
    const options = upstreamOptions(fetch, log, { maxRetryAfterMs: 3000 });
    await fetchTflJson('/x', options);
    expect(options.sleeps).toEqual([3000]);
  });

  it('gives up after the attempt cap and reports the last failure', async () => {
    const { fetch, calls } = fakeFetch(() => new Response('no', { status: 502 }));
    const { log, lines } = collectLogs();
    const error = await failureOf(
      fetchTflJson('/x', upstreamOptions(fetch, log, { maxAttempts: 3 })),
    );
    expect(calls).toHaveLength(3);
    expect(error).toMatchObject({ failure: 'http', status: 502 });
    expect(lines.some((l) => l.includes('upstream_gave_up'))).toBe(true);
  });

  it.each([400, 401, 403, 404])('does not retry a %i', async (status) => {
    const { fetch, calls } = fakeFetch(() => new Response('no', { status }));
    const { log } = collectLogs();
    const error = await failureOf(fetchTflJson('/x', upstreamOptions(fetch, log)));
    expect(calls).toHaveLength(1);
    expect(error).toMatchObject({ failure: 'http', status });
  });

  it('times out a hung request and retries it', async () => {
    let n = 0;
    const { fetch, calls } = fakeFetch((_url, init) =>
      ++n > 1 ? json({ ok: 1 }) : hang(init),
    );
    const { log } = collectLogs();
    const result = await fetchTflJson(
      '/x',
      upstreamOptions(fetch, log, { timeoutMs: 20 }),
    );
    expect(result).toEqual({ ok: 1 });
    expect(calls).toHaveLength(2);
  });

  it('reports a persistent timeout as a timeout', async () => {
    const { fetch } = fakeFetch((_url, init) => hang(init));
    const { log } = collectLogs();
    const error = await failureOf(
      fetchTflJson('/x', upstreamOptions(fetch, log, { timeoutMs: 10, maxAttempts: 2 })),
    );
    expect(error.failure).toBe('timeout');
  });

  it('retries a network error', async () => {
    let n = 0;
    const { fetch } = fakeFetch(() => {
      if (++n === 1) throw new TypeError('connection reset');
      return json({ ok: 1 });
    });
    const { log } = collectLogs();
    expect(await fetchTflJson('/x', upstreamOptions(fetch, log))).toEqual({ ok: 1 });
  });

  it('treats invalid JSON as a parse failure without retrying', async () => {
    const { fetch, calls } = fakeFetch(
      () => new Response('<html>oops</html>', { status: 200 }),
    );
    const { log } = collectLogs();
    const error = await failureOf(fetchTflJson('/x', upstreamOptions(fetch, log)));
    expect(error.failure).toBe('parse');
    expect(calls).toHaveLength(1);
  });

  describe('the key never leaks', () => {
    it('is absent from errors and logs when fetch throws a message holding the URL', async () => {
      const { fetch } = fakeFetch((url) => {
        throw new TypeError(`fetch failed for ${url.toString()} with key ${KEY}`);
      });
      const { log, lines } = collectLogs();
      const error = await failureOf(fetchTflJson('/Line/x', upstreamOptions(fetch, log)));
      expect(error.message).not.toContain(KEY);
      expect(lines.length).toBeGreaterThan(0);
      expect(lines.join('\n')).not.toContain(KEY);
    });

    it('is absent from logs of a failing HTTP call', async () => {
      const { fetch } = fakeFetch(() => new Response(`bad key ${KEY}`, { status: 500 }));
      const { log, lines } = collectLogs();
      const error = await failureOf(fetchTflJson('/Line/x', upstreamOptions(fetch, log)));
      expect(error.message).not.toContain(KEY);
      expect(lines.length).toBeGreaterThan(0);
      expect(lines.join('\n')).not.toContain(KEY);
    });
  });
});

describe('parseRetryAfter', () => {
  const now = Date.parse('2026-11-08T09:00:00Z');

  it.each([
    ['whole seconds', '5', 5000],
    ['zero', '0', 0],
    ['an HTTP date in the future', 'Sun, 08 Nov 2026 09:00:10 GMT', 10_000],
    ['an HTTP date in the past', 'Sun, 08 Nov 2026 08:00:00 GMT', 0],
    ['garbage', 'soon', null],
    ['an empty string', '', null],
    ['a missing header', null, null],
  ])('reads %s', (_name, header, expected) => {
    expect(parseRetryAfter(header, now)).toBe(expected);
  });
});
