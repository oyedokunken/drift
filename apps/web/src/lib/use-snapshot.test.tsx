import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { snapshot, snapshotResponse } from '../test-data.ts';
import {
  MAX_BACKOFF_MS,
  POLL_MS,
  REQUEST_TIMEOUT_MS,
  nextDelayMs,
  useSnapshot,
} from './use-snapshot.ts';

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

const ok = () => Promise.resolve(snapshotResponse(snapshot()));
const down = () => Promise.resolve(new Response('no', { status: 503 }));

beforeEach(() => {
  vi.useFakeTimers();
  setVisibility('visible');
});

afterEach(() => {
  vi.useRealTimers();
});

async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('nextDelayMs', () => {
  it.each([
    [0, POLL_MS],
    [1, POLL_MS * 2],
    [2, POLL_MS * 4],
    [3, MAX_BACKOFF_MS],
    [10, MAX_BACKOFF_MS],
  ])('after %i failures waits %i ms', (failures, expected) => {
    expect(nextDelayMs(failures)).toBe(expected);
  });
});

describe('useSnapshot', () => {
  it('starts loading, then holds the first snapshot', async () => {
    const fetchMock = vi.fn<typeof fetch>(ok);
    const { result } = renderHook(() => useSnapshot(fetchMock));
    expect(result.current.status).toBe('loading');
    await settle();
    expect(result.current.status).toBe('ready');
    expect(result.current.data?.snapshot.verdicts).toHaveLength(11);
    expect(result.current.failures).toBe(0);
  });

  it('refreshes about every minute', async () => {
    const fetchMock = vi.fn<typeof fetch>(ok);
    renderHook(() => useSnapshot(fetchMock));
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await advance(POLL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await advance(POLL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('is failed, not blank, when the very first request fails', async () => {
    const fetchMock = vi.fn<typeof fetch>(down);
    const { result } = renderHook(() => useSnapshot(fetchMock));
    await settle();
    expect(result.current).toMatchObject({ status: 'failed', data: null, failures: 1 });
  });

  it('keeps showing the last good data when a refresh fails', async () => {
    const fetchMock = vi.fn<typeof fetch>(ok);
    const { result } = renderHook(() => useSnapshot(fetchMock));
    await settle();
    fetchMock.mockImplementation(down);
    await advance(POLL_MS);
    expect(result.current.status).toBe('ready');
    expect(result.current.data).not.toBeNull();
    expect(result.current.failures).toBe(1);
  });

  it('backs off while failing and recovers when the service returns', async () => {
    const fetchMock = vi.fn<typeof fetch>(down);
    const { result } = renderHook(() => useSnapshot(fetchMock));
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await advance(POLL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await advance(POLL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockImplementation(ok);
    await advance(POLL_MS * 4);
    expect(result.current).toMatchObject({ status: 'ready', failures: 0 });
  });

  it('abandons a request that hangs and counts it as a failure', async () => {
    const fetchMock = vi.fn<typeof fetch>(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'));
          });
        }),
    );
    const { result } = renderHook(() => useSnapshot(fetchMock));
    await advance(REQUEST_TIMEOUT_MS + 100);
    expect(result.current).toMatchObject({
      status: 'failed',
      failures: 1,
      refreshing: false,
    });
  });

  it('pauses while the tab is hidden and catches up when it returns', async () => {
    const fetchMock = vi.fn<typeof fetch>(ok);
    renderHook(() => useSnapshot(fetchMock));
    await settle();

    act(() => {
      setVisibility('hidden');
    });
    await advance(POLL_MS * 10);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    act(() => {
      setVisibility('visible');
    });
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not refetch on return when the data is still fresh', async () => {
    const fetchMock = vi.fn<typeof fetch>(ok);
    renderHook(() => useSnapshot(fetchMock));
    await settle();
    act(() => {
      setVisibility('hidden');
    });
    await advance(2000);
    act(() => {
      setVisibility('visible');
    });
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('aborts the request in flight when unmounted', async () => {
    let seen: AbortSignal | undefined;
    const fetchMock = vi.fn<typeof fetch>(
      (_input, init) =>
        new Promise<Response>(() => {
          seen = init?.signal ?? undefined;
        }),
    );
    const { unmount } = renderHook(() => useSnapshot(fetchMock));
    await settle();
    expect(seen?.aborted).toBe(false);
    unmount();
    expect(seen?.aborted).toBe(true);
  });

  it('stops polling after unmount', async () => {
    const fetchMock = vi.fn<typeof fetch>(ok);
    const { unmount } = renderHook(() => useSnapshot(fetchMock));
    await settle();
    unmount();
    await advance(POLL_MS * 5);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refreshes at once on request', async () => {
    const fetchMock = vi.fn<typeof fetch>(ok);
    const { result } = renderHook(() => useSnapshot(fetchMock));
    await settle();
    act(() => {
      result.current.refresh();
    });
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries when the browser comes back online', async () => {
    const fetchMock = vi.fn<typeof fetch>(down);
    renderHook(() => useSnapshot(fetchMock));
    await settle();
    fetchMock.mockImplementation(ok);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('ignores a slow answer that has been superseded by a newer request', async () => {
    const resolvers: ((response: Response) => void)[] = [];
    const fetchMock = vi.fn<typeof fetch>(
      () => new Promise<Response>((resolve) => resolvers.push(resolve)),
    );
    const { result } = renderHook(() => useSnapshot(fetchMock));
    await settle();
    act(() => {
      result.current.refresh();
    });
    await settle();
    expect(resolvers).toHaveLength(2);

    await act(async () => {
      resolvers[1]?.(
        snapshotResponse(snapshot({ generatedAt: '2026-11-08T09:05:00.000Z' })),
      );
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      resolvers[0]?.(
        snapshotResponse(snapshot({ generatedAt: '2026-11-08T08:00:00.000Z' })),
      );
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.data?.snapshot.generatedAt).toBe('2026-11-08T09:05:00.000Z');
  });
});
