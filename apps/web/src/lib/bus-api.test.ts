import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BUS_TIMEOUT_MS, fetchBus } from './bus-api.ts';

/** A fetch that never answers until it is aborted, like a hung connection. */
function hanging(): typeof fetch {
  return (_input, init) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('aborted', 'AbortError'));
      });
    });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('fetchBus timeout', () => {
  it('gives up on a hung request after the timeout and says the check failed', async () => {
    const pending = fetchBus('207', new AbortController().signal, hanging());
    await vi.advanceTimersByTimeAsync(BUS_TIMEOUT_MS + 1);
    await expect(pending).resolves.toEqual({ kind: 'failed' });
  });

  it('does not give up early', async () => {
    let settled = false;
    const pending = fetchBus('207', new AbortController().signal, hanging()).then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(BUS_TIMEOUT_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    await pending;
    expect(settled).toBe(true);
  });

  it('still rejects when the caller aborts, so a newer search can take over', async () => {
    const controller = new AbortController();
    const pending = fetchBus('207', controller.signal, hanging());
    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(DOMException);
  });
});
