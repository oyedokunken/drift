import { busRouteSchema, type ApiError } from '@drift/shared';
import type { BusOutcome } from './bus.ts';
import { CACHE, secured } from './headers.ts';
import type { SnapshotResult } from './snapshot.ts';

/** The slice of the Workers Cache API the app uses. */
export interface CacheLike {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

export interface AppDeps {
  readonly now: () => Date;
  readonly snapshot: { get(): Promise<SnapshotResult> };
  /** Checks one validated bus route. The work happens in the Durable Object. */
  readonly bus: (route: string) => Promise<BusOutcome>;
  readonly cache: CacheLike;
  /** Serves the built web app. */
  readonly assets: (request: Request) => Promise<Response>;
}

/** How long the Worker keeps a built snapshot, so TfL traffic does not follow visitor count. */
const SNAPSHOT_CACHE_SECONDS = 45;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function apiError(
  code: ApiError['error']['code'],
  message: string,
  status: number,
): Response {
  const response = secured(
    json({ error: { code, message } } satisfies ApiError, status),
    CACHE.none,
  );
  if (status === 503) response.headers.set('Retry-After', '30');
  if (status === 405) response.headers.set('Allow', 'GET');
  return response;
}

/**
 * The Worker's clock at the moment of replying. A cached snapshot can be 45 seconds old,
 * so the browser cannot learn the server time from the snapshot or the Date header.
 */
function withServerTime(response: Response, deps: AppDeps): Response {
  response.headers.set('X-Server-Time', deps.now().toISOString());
  return response;
}

async function snapshotResponse(request: Request, deps: AppDeps): Promise<Response> {
  const cacheKey = new Request(new URL('/api/snapshot', request.url));

  const hit = await deps.cache.match(cacheKey);
  if (hit) {
    return withServerTime(
      secured(new Response(await hit.text(), hit), CACHE.snapshot),
      deps,
    );
  }

  const result = await deps.snapshot.get();
  if (result.kind === 'unavailable') {
    return apiError(
      'upstream_unavailable',
      'Live data is temporarily unavailable and there is no earlier snapshot to show.',
      503,
    );
  }

  const body = JSON.stringify(result.snapshot);
  if (result.kind === 'fresh') {
    const stored = new Response(body, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': `public, max-age=${SNAPSHOT_CACHE_SECONDS}`,
      },
    });
    await deps.cache.put(cacheKey, stored);
  }
  const cacheControl = result.kind === 'fresh' ? CACHE.snapshot : CACHE.none;
  const response = new Response(body, {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
  return withServerTime(secured(response, cacheControl), deps);
}

/** The raw path segment, decoded. A malformed escape is returned as it is and then rejected. */
function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

const BUS_PATH = /^\/api\/bus\/([^/]*)$/;

/**
 * One bus route. The route is validated before anything else happens, and no message
 * repeats what the visitor sent, so nothing they type is reflected in a response.
 */
async function busResponse(segment: string, deps: AppDeps): Promise<Response> {
  const route = busRouteSchema.safeParse(decodeSegment(segment));
  if (!route.success) {
    return apiError(
      'invalid_route',
      'A bus route is one to four letters or digits, like 207 or W11.',
      400,
    );
  }

  const outcome = await deps.bus(route.data);
  switch (outcome.kind) {
    case 'ok':
      return withServerTime(secured(json(outcome.result), CACHE.none), deps);
    case 'not_found':
      return apiError('route_not_found', 'TfL has no bus route with that number.', 404);
    case 'busy': {
      const response = apiError(
        'busy',
        'Too many bus checks just now. Please try again in a moment.',
        429,
      );
      response.headers.set('Retry-After', String(outcome.retryAfterSeconds));
      return response;
    }
    case 'unavailable':
      return apiError(
        'upstream_unavailable',
        'Bus data is temporarily unavailable and there is no earlier result for this route.',
        503,
      );
  }
}

async function assetResponse(request: Request, deps: AppDeps): Promise<Response> {
  const response = await deps.assets(request);
  const { pathname } = new URL(request.url);
  const isHtml = response.headers.get('Content-Type')?.includes('text/html') === true;

  if (pathname.startsWith('/assets/')) return secured(response, CACHE.immutable);
  return secured(response, isHtml ? CACHE.revalidate : CACHE.daily);
}

/** Route a request: the API routes, a typed error for any other API path, else the app. */
export function createApp(deps: AppDeps): (request: Request) => Promise<Response> {
  return async (request) => {
    const { pathname } = new URL(request.url);

    if (!pathname.startsWith('/api/')) return assetResponse(request, deps);

    const bus = BUS_PATH.exec(pathname);
    if (pathname !== '/api/snapshot' && pathname !== '/api/health' && bus === null) {
      return apiError('not_found', 'No such API route.', 404);
    }
    if (request.method !== 'GET') {
      return apiError('method_not_allowed', 'Only GET is supported.', 405);
    }
    if (bus !== null) return busResponse(bus[1] ?? '', deps);
    if (pathname === '/api/health') return secured(json({ ok: true }), CACHE.none);

    return snapshotResponse(request, deps);
  };
}
