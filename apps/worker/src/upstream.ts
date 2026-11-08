import type { Logger } from './log.ts';
import { redact, safeUrl } from './redact.ts';

export type UpstreamFailure = 'timeout' | 'network' | 'http' | 'parse';

/** A failed upstream call. The message never contains the TfL key. */
export class UpstreamError extends Error {
  readonly failure: UpstreamFailure;
  readonly status: number | undefined;

  constructor(failure: UpstreamFailure, message: string, status?: number) {
    super(message);
    this.name = 'UpstreamError';
    this.failure = failure;
    this.status = status;
  }
}

export interface UpstreamOptions {
  readonly key: string;
  readonly fetch: typeof fetch;
  readonly log: Logger;
  /** Resolves after the given milliseconds. Injected so tests do not wait. */
  readonly sleep: (ms: number) => Promise<void>;
  /** Returns a number in [0, 1). Injected so tests are deterministic. */
  readonly random: () => number;
  /** Per attempt timeout. */
  readonly timeoutMs: number;
  /** Total attempts, including the first. */
  readonly maxAttempts: number;
  /** First backoff step, doubled each retry, then jittered. */
  readonly baseDelayMs: number;
  /** The longest the worker will wait for a Retry-After. */
  readonly maxRetryAfterMs: number;
}

export const DEFAULT_UPSTREAM = {
  timeoutMs: 5000,
  maxAttempts: 3,
  baseDelayMs: 250,
  maxRetryAfterMs: 3000,
} as const;

const RETRYABLE_STATUS = (status: number): boolean => status === 429 || status >= 500;

/** Retry-After is either whole seconds or an HTTP date. Returns milliseconds, or null. */
export function parseRetryAfter(header: string | null, now: number): number | null {
  if (header === null) return null;
  const seconds = Number(header);
  if (header.trim() !== '' && Number.isFinite(seconds))
    return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
}

function backoffMs(attempt: number, options: UpstreamOptions): number {
  return options.random() * options.baseDelayMs * 2 ** (attempt - 1);
}

async function attemptOnce(url: URL, options: UpstreamOptions): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, options.timeoutMs);
  try {
    return await options.fetch(url, { signal: controller.signal });
  } catch (error) {
    const timedOut = controller.signal.aborted;
    const detail = error instanceof Error ? error.message : 'unknown error';
    throw new UpstreamError(
      timedOut ? 'timeout' : 'network',
      timedOut
        ? 'Upstream request timed out'
        : redact(`Upstream request failed: ${detail}`, options.key),
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * GET a TfL path and return its parsed JSON. Adds the key, times out each attempt,
 * and retries network errors, timeouts, 5xx and 429 with exponential backoff and
 * jitter, honouring Retry-After. Other client errors fail at once.
 */
export async function fetchTflJson(
  path: string,
  options: UpstreamOptions,
  nowMs: () => number = Date.now,
): Promise<unknown> {
  const url = new URL(`https://api.tfl.gov.uk${path}`);
  url.searchParams.set('app_key', options.key);
  const shown = safeUrl(url, options.key);

  let lastError: UpstreamError | undefined;

  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    let waitMs = backoffMs(attempt, options);
    try {
      const response = await attemptOnce(url, options);

      if (response.ok) {
        try {
          return await response.json();
        } catch {
          throw new UpstreamError('parse', 'Upstream response was not valid JSON');
        }
      }

      lastError = new UpstreamError(
        'http',
        `Upstream returned HTTP ${response.status}`,
        response.status,
      );
      if (!RETRYABLE_STATUS(response.status)) throw lastError;

      const retryAfter = parseRetryAfter(response.headers.get('retry-after'), nowMs());
      if (retryAfter !== null) waitMs = Math.min(retryAfter, options.maxRetryAfterMs);
    } catch (error) {
      if (!(error instanceof UpstreamError)) throw error;
      lastError = error;
      if (
        error.failure === 'parse' ||
        (error.failure === 'http' && !RETRYABLE_STATUS(error.status ?? 0))
      ) {
        options.log('warn', 'upstream_failed', {
          url: shown,
          attempt,
          failure: error.failure,
        });
        throw error;
      }
    }

    if (attempt < options.maxAttempts) {
      options.log('warn', 'upstream_retry', {
        url: shown,
        attempt,
        failure: lastError.failure,
        status: lastError.status ?? null,
        waitMs: Math.round(waitMs),
      });
      await options.sleep(waitMs);
    }
  }

  options.log('error', 'upstream_gave_up', { url: shown, attempts: options.maxAttempts });
  throw lastError ?? new UpstreamError('network', 'Upstream request failed');
}
