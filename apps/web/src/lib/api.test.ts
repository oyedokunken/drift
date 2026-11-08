import { describe, expect, it, vi } from 'vitest';
import { snapshot, snapshotResponse } from '../test-data.ts';
import { SnapshotError, fetchSnapshot } from './api.ts';

const signal = () => new AbortController().signal;
const respond = (response: Response) =>
  vi.fn<typeof fetch>(() => Promise.resolve(response));

async function failureOf(promise: Promise<unknown>): Promise<SnapshotError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof SnapshotError) return error;
    throw error;
  }
  throw new Error('expected a failure');
}

describe('fetchSnapshot', () => {
  it('returns a validated snapshot and asks for JSON', async () => {
    const fetchMock = respond(snapshotResponse(snapshot()));
    const result = await fetchSnapshot(signal(), fetchMock);
    expect(result.snapshot.verdicts).toHaveLength(11);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/snapshot',
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    );
  });

  it('measures the server clock offset from X-Server-Time', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-08T09:00:00Z'));
    const response = snapshotResponse(snapshot(), '2026-11-08T09:01:00.000Z');
    const result = await fetchSnapshot(signal(), respond(response));
    expect(result.serverOffsetMs).toBe(60_000);
    vi.useRealTimers();
  });

  it.each([
    ['is missing', undefined],
    ['is not a date', 'yesterday'],
  ])('uses no offset when X-Server-Time %s', async (_name, value) => {
    const response = new Response(JSON.stringify(snapshot()), {
      headers: value === undefined ? {} : { 'X-Server-Time': value },
    });
    expect((await fetchSnapshot(signal(), respond(response))).serverOffsetMs).toBe(0);
  });

  it('reports a typed server error with its message', async () => {
    const body = {
      error: { code: 'upstream_unavailable', message: 'No data right now.' },
    };
    const error = await failureOf(
      fetchSnapshot(
        signal(),
        respond(new Response(JSON.stringify(body), { status: 503 })),
      ),
    );
    expect(error).toMatchObject({ failure: 'http', message: 'No data right now.' });
  });

  it('falls back to a generic message when the error body is not typed', async () => {
    const error = await failureOf(
      fetchSnapshot(
        signal(),
        respond(new Response('<html>bad gateway</html>', { status: 502 })),
      ),
    );
    expect(error).toMatchObject({ failure: 'http' });
    expect(error.message).toContain('502');
  });

  it.each([
    ['not JSON', 'definitely not json'],
    ['the wrong shape', JSON.stringify({ verdicts: 'many' })],
    [
      'a verdict with an unknown rule',
      JSON.stringify({ ...snapshot(), verdicts: [{ lineId: 'central' }] }),
    ],
  ])('rejects a 200 whose body is %s', async (_name, body) => {
    const error = await failureOf(fetchSnapshot(signal(), respond(new Response(body))));
    expect(error.failure).toBe('invalid');
  });

  it('turns a network failure into a typed error', async () => {
    const fetchMock = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('offline')));
    expect((await failureOf(fetchSnapshot(signal(), fetchMock))).failure).toBe('network');
  });

  it('lets an abort through untouched, so callers can tell it from a failure', async () => {
    const controller = new AbortController();
    const abort = new DOMException('aborted', 'AbortError');
    const fetchMock = vi.fn<typeof fetch>(() => {
      controller.abort();
      return Promise.reject(abort);
    });
    await expect(fetchSnapshot(controller.signal, fetchMock)).rejects.toBe(abort);
  });
});
