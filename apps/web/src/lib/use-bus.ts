import { useCallback, useEffect, useRef, useState } from 'react';
import { busRouteSchema, type BusResult } from '@drift/shared';
import { fetchBus } from './bus-api.ts';

export type BusState =
  | { readonly phase: 'idle' }
  | { readonly phase: 'invalid'; readonly message: string }
  | { readonly phase: 'loading'; readonly route: string }
  | { readonly phase: 'result'; readonly result: BusResult }
  | { readonly phase: 'not-found'; readonly route: string }
  | {
      readonly phase: 'trouble';
      readonly reason: 'busy' | 'unavailable' | 'failed';
      readonly retryAfterSeconds: number | null;
      /** The last good result for the route being asked about, if there is one. */
      readonly previous: BusResult | null;
    };

/** The route in the address, normalised, or null when there is none or it is not valid. */
export function routeFromSearch(search: string): string | null {
  const raw = new URLSearchParams(search).get('bus');
  if (raw === null) return null;
  const parsed = busRouteSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Keeps the address in step with the route being shown, so the page can be shared. */
function writeAddress(route: string | null): void {
  const url = new URL(window.location.href);
  if (route === null) url.searchParams.delete('bus');
  else url.searchParams.set('bus', route);
  window.history.replaceState(null, '', url);
}

/**
 * The bus search as a small state machine. A newer search cancels the one before it, so
 * an answer that arrives late can never replace a newer one.
 */
export function useBusSearch(initialRoute: string | null) {
  const [state, setState] = useState<BusState>({ phase: 'idle' });
  const controller = useRef<AbortController | null>(null);
  const lastGood = useRef<BusResult | null>(null);

  const run = useCallback(async (route: string) => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setState({ phase: 'loading', route });
    writeAddress(route);

    try {
      const lookup = await fetchBus(route, current.signal);
      if (current.signal.aborted) return;
      switch (lookup.kind) {
        case 'ok':
          lastGood.current = lookup.result;
          setState({ phase: 'result', result: lookup.result });
          return;
        case 'not_found':
          setState({ phase: 'not-found', route });
          return;
        case 'busy':
        case 'unavailable':
        case 'failed': {
          const previous = lastGood.current?.route === route ? lastGood.current : null;
          setState({
            phase: 'trouble',
            reason: lookup.kind,
            retryAfterSeconds: lookup.kind === 'busy' ? lookup.retryAfterSeconds : null,
            previous,
          });
        }
      }
    } catch {
      // Only an abort reaches here, which means a newer search took over.
    }
  }, []);

  /** Validate what was typed, then check it. Nothing invalid goes to the server. */
  const submit = useCallback(
    (input: string) => {
      const parsed = busRouteSchema.safeParse(input);
      if (!parsed.success) {
        controller.current?.abort();
        setState({
          phase: 'invalid',
          message: parsed.error.issues[0]?.message ?? 'That is not a bus route.',
        });
        return;
      }
      void run(parsed.data);
    },
    [run],
  );

  useEffect(() => {
    if (initialRoute !== null) void run(initialRoute);
    return () => {
      controller.current?.abort();
    };
  }, [initialRoute, run]);

  return { state, submit };
}
