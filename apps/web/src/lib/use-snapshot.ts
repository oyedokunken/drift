import { useCallback, useEffect, useReducer, useRef } from 'react';
import { fetchSnapshot, type FetchedSnapshot } from './api.ts';

/** How often the page asks for a new snapshot while it is visible and healthy. */
export const POLL_MS = 60_000;
/** The longest wait between attempts while failing. */
export const MAX_BACKOFF_MS = 300_000;
/** A request that has not finished by now is abandoned and counted as a failure. */
export const REQUEST_TIMEOUT_MS = 10_000;
/** A tab that comes back to the front refreshes at once if its data is older than this. */
export const RESUME_AFTER_MS = 15_000;

export interface SnapshotState {
  /** `loading` before the first answer, `failed` when there is no data and the last try failed. */
  readonly status: 'loading' | 'ready' | 'failed';
  /** The last good snapshot. It stays in place while a refresh runs or fails. */
  readonly data: FetchedSnapshot | null;
  /** Consecutive failed attempts since the last success. */
  readonly failures: number;
  readonly refreshing: boolean;
  /** Device time of the last successful fetch, in milliseconds. */
  readonly updatedAt: number | null;
}

type Action =
  | { readonly type: 'start' }
  | { readonly type: 'success'; readonly data: FetchedSnapshot; readonly at: number }
  | { readonly type: 'failure' };

const initialState: SnapshotState = {
  status: 'loading',
  data: null,
  failures: 0,
  refreshing: false,
  updatedAt: null,
};

function reducer(state: SnapshotState, action: Action): SnapshotState {
  switch (action.type) {
    case 'start':
      return { ...state, refreshing: true };
    case 'success':
      return {
        status: 'ready',
        data: action.data,
        failures: 0,
        refreshing: false,
        updatedAt: action.at,
      };
    case 'failure':
      return {
        ...state,
        status: state.data === null ? 'failed' : 'ready',
        failures: state.failures + 1,
        refreshing: false,
      };
  }
}

/** The wait before the next attempt: steady while healthy, doubling after each failure. */
export function nextDelayMs(failures: number): number {
  return Math.min(POLL_MS * 2 ** failures, MAX_BACKOFF_MS);
}

/**
 * Keeps the latest snapshot fresh. It refreshes about every minute, pauses while the tab
 * is hidden, abandons slow requests, backs off while failing, keeps showing the last good
 * data throughout, and cancels everything when the component unmounts.
 */
export function useSnapshot(fetchImpl: typeof fetch = fetch): SnapshotState & {
  refresh: () => void;
} {
  const [state, dispatch] = useReducer(reducer, initialState);
  const refreshRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    let disposed = false;
    let failures = 0;
    let lastAttemptAt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;

    const clearTimer = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    };

    const schedule = () => {
      clearTimer();
      if (disposed || document.visibilityState === 'hidden') return;
      timer = setTimeout(() => {
        void run();
      }, nextDelayMs(failures));
    };

    const run = async (): Promise<void> => {
      clearTimer();
      controller?.abort();
      const attempt = new AbortController();
      controller = attempt;
      lastAttemptAt = Date.now();

      let timedOut = false;
      const giveUp = setTimeout(() => {
        timedOut = true;
        attempt.abort();
      }, REQUEST_TIMEOUT_MS);

      dispatch({ type: 'start' });
      try {
        const data = await fetchSnapshot(attempt.signal, fetchImpl);
        if (disposed || controller !== attempt) return;
        failures = 0;
        dispatch({ type: 'success', data, at: Date.now() });
      } catch {
        const replaced = disposed || controller !== attempt;
        const cancelled = attempt.signal.aborted && !timedOut;
        if (replaced || cancelled) return;
        failures += 1;
        dispatch({ type: 'failure' });
      } finally {
        clearTimeout(giveUp);
      }
      schedule();
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        clearTimer();
      } else if (Date.now() - lastAttemptAt > RESUME_AFTER_MS) {
        void run();
      } else {
        schedule();
      }
    };
    const onOnline = () => {
      void run();
    };

    refreshRef.current = () => {
      void run();
    };
    void run();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);

    return () => {
      disposed = true;
      clearTimer();
      controller?.abort();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
    };
  }, [fetchImpl]);

  const refresh = useCallback(() => {
    refreshRef.current();
  }, []);

  return { ...state, refresh };
}
