import { apiErrorSchema, busResultSchema, type BusResult } from '@drift/shared';

/** Every way a bus check can end, so the page can say something calm for each one. */
export type BusLookup =
  | { readonly kind: 'ok'; readonly result: BusResult }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'busy'; readonly retryAfterSeconds: number | null }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'failed' };

/**
 * How long a bus check may take before the page gives up. A first check after a deploy
 * also fetches the route list, which took about 5 seconds locally, and the Worker retries
 * a failing upstream, so this is generous.
 */
export const BUS_TIMEOUT_MS = 20_000;

function retryAfter(response: Response): number | null {
  const seconds = Number(response.headers.get('Retry-After'));
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : null;
}

/**
 * Ask the Worker about one route. `route` is already validated and upper cased, so it
 * is safe in a path. The answer is validated before it is trusted: anything that does
 * not match a known shape is `failed`.
 */
export async function fetchBus(
  route: string,
  signal: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<BusLookup> {
  const timeout = new AbortController();
  const timer = setTimeout(() => {
    timeout.abort();
  }, BUS_TIMEOUT_MS);
  try {
    return await ask(route, AbortSignal.any([signal, timeout.signal]), fetchImpl, signal);
  } finally {
    clearTimeout(timer);
  }
}

async function ask(
  route: string,
  signal: AbortSignal,
  fetchImpl: typeof fetch,
  callerSignal: AbortSignal,
): Promise<BusLookup> {
  let response: Response;
  try {
    response = await fetchImpl(`/api/bus/${encodeURIComponent(route)}`, { signal });
  } catch (error) {
    // A caller's abort means a newer search took over. A timeout is just a failed check.
    if (callerSignal.aborted) throw error;
    return { kind: 'failed' };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { kind: 'failed' };
  }

  if (response.ok) {
    const parsed = busResultSchema.safeParse(body);
    return parsed.success ? { kind: 'ok', result: parsed.data } : { kind: 'failed' };
  }

  const error = apiErrorSchema.safeParse(body);
  if (!error.success) return { kind: 'failed' };
  switch (error.data.error.code) {
    case 'route_not_found':
      return { kind: 'not_found' };
    case 'busy':
      return { kind: 'busy', retryAfterSeconds: retryAfter(response) };
    case 'upstream_unavailable':
      return { kind: 'unavailable' };
    default:
      return { kind: 'failed' };
  }
}
