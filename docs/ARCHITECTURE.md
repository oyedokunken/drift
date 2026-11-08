# Architecture

Drift is one Cloudflare Worker on the free tier. It serves the built React app
as static assets and answers `/api/*`. Same origin, so no CORS. This page
records the design and, in particular, the constraints that shaped it.

## The constraints

Measured on 2026-11-08 (details in `docs/API-NOTES.md`):

- Arrivals for the Tube is **3.3 MB** (4.4 MB with the Elizabeth line) and
  takes several seconds to download in one call.
- Parsing the full 4.4 MB costs about **25 to 45 ms of CPU** inside a Worker, as
  reported by the platform (`wrangler tail`). On a fast desktop, `JSON.parse`
  alone took 20 to 37 ms.
- Cloudflare documents **10 ms of CPU per invocation** for Workers Free,
  including Cron Triggers.
- Workers KV on the free plan allows **1,000 writes per day**, so it cannot hold
  state that changes every minute.

## What a deployed spike showed

A throwaway Worker (deleted afterwards) on this account, which is on Workers
Free, parsed a 4.4 MB payload shaped like the real feed:

| Where                 | Result                                                  |
| --------------------- | ------------------------------------------------------- |
| Plain Worker handler  | 200 parses (about 2 s of CPU) in one request, no kill   |
| SQLite Durable Object | 1000 parses (about 10 s of CPU) in one request, no kill |

So the documented 10 ms limit was not enforced at those scales, and a Durable
Object (documented default 30 s CPU) comfortably holds a full refresh. This is
an observation about one account on one day, not a guarantee, so the design
below does not lean on it more than it must.

## The decision

Keep heavy work out of the request path and inside a Durable Object, and keep
the request handler tiny so it would stay inside 10 ms even if enforcement
tightened.

1. **One cron trigger, every minute.** The Worker's `scheduled` handler only
   asks the Durable Object to refresh. It does no parsing itself.
2. **Refresh inside a SQLite backed Durable Object.** The refresh fetches
   `Line/{ids}/Arrivals` for five fixed groups of lines in parallel (each
   roughly 0.5 to 0.9 MB, well inside the 5 second upstream timeout), validates
   the predictions, and reduces each line to one tiny summary with the engine's
   pure `summarise()`. Summaries are stored per line, each with its own
   `fetchedAt`. If one group fails, the other lines still refresh and the failed
   lines keep their previous summary, which ages.
3. **Cheap request path.** `GET /api/snapshot` fetches the small status feed
   (about 13 KB, well under 1 ms to parse), reads the summaries from the Durable
   Object, runs the engine, and returns one snapshot. A 45 second Cache API layer
   keeps TfL and Durable Object traffic independent of visitor count.

Why a Durable Object and not KV: KV's free write cap (1,000 a day) cannot take a
write per minute. The brief suggests KV for the last good snapshot; the Durable
Object does that job instead and also holds the summaries.

Line groups, balanced by Sunday morning prediction counts:

| Group | Lines                                    |
| ----- | ---------------------------------------- |
| A     | northern                                 |
| B     | piccadilly, victoria                     |
| C     | district, circle, jubilee, waterloo-city |
| D     | central, bakerloo                        |
| E     | metropolitan, hammersmith-city           |

## Scope

Tube lines only. The Elizabeth line would fit the CPU budget (its 1 MB parses
in a few milliseconds), but it does not pass the second test: on real data its
typical headway was 12.7 minutes with a 30 minute spread across platforms,
against a 15 minute rule threshold. The headway rule would raise false alarms
on a healthy Elizabeth line, so it is left out rather than shipped unreliable.

## Components

```
apps/web         React app. Fetches /api/snapshot, validates it, renders.
apps/worker      Worker: fetch handler (/api/*, static assets), scheduled
                 handler (cron), Durable Object (refresh and summary store).
packages/engine  Pure: summarise(predictions) and evaluate(statuses,
                 summaries, now). No I/O, no clock.
packages/shared  Zod schemas and types used by worker and web.
```

## Data flow

```
 every minute (cron)                  on each visitor request
 Worker.scheduled --> Durable Object  TfL Status (13 KB) -----+
        refresh: 5 parallel                                   v
        Arrivals fetches, parse,      Durable Object --> evaluate() --> snapshot
        Zod, summarise() ----------->  (summaries)        (engine)         |
                                                                           v
                                      Cache API (45 s) --> browser (Zod) --> UI
```

## Web app decisions

- **Animation features load lazily.** The brief asks for LazyMotion with `domAnimation`
  and also for a layout animation when lines reorder. The layout feature only exists in
  the larger `domMax` set, so the features are fetched as a separate chunk after first
  paint (strict mode and `m` components throughout). The count up animation engine is a
  second lazy chunk, loaded only when a number actually changes. Initial JavaScript is
  about 115 KB gzipped, of which React is 67 KB.
- **The data request starts during HTML parsing.** `index.html` preloads
  `/api/snapshot`, so the request runs in parallel with the scripts instead of after
  them. The app's own request carries no custom headers, so the browser reuses the
  preloaded response (checked: one request on first load, not two).
- **Server time, not device time.** Every snapshot response carries `X-Server-Time`.
  The browser measures its offset from the server and shows ages on that clock, because
  a cached snapshot can be 45 seconds old and a device clock can be wrong.

## Resilience model

- **Timeouts and retries**: every upstream call has a 5 second AbortController
  timeout and retries with exponential backoff and jitter on network errors,
  5xx and 429, honouring `Retry-After`, with a small capped attempt count.
- **Coalescing**: concurrent requests in one isolate share one in flight
  snapshot build, so a burst of visitors causes one upstream status call.
- **Last known good, per line**: each line's summary keeps its own `fetchedAt`.
  The engine treats summaries older than 240 seconds as `unknown`, so old data
  never produces a false alarm.
- **Status feed down**: the Worker serves the last snapshot it built (kept in
  the Durable Object) marked `stale: true`. With no snapshot at all it returns a
  typed 503 body, never a bare 500.
- **Browser**: validates the snapshot with the shared Zod schema, refreshes
  about every 60 seconds, pauses when the tab is hidden, aborts on unmount,
  backs off on failure, and keeps showing the last good data while refreshing.
- **Secrets**: the TfL key is a Cloudflare secret in production and a gitignored
  `.dev.vars` locally. It is redacted from every log and error path, because
  TfL takes it as a query string parameter.

## Trade-offs

- A Durable Object adds a moving part compared with a plain fetch and cache.
  The free tier makes that the honest price of live data.
- Line data can be up to about a minute older than the status feed. The browser
  shows the two ages separately.
- The design relies on a Durable Object's CPU headroom for the refresh. If
  production measurements ever show the refresh nearing a limit, it can be split
  by group across several Durable Object calls without changing anything else.

## Open measurements (Stage 7)

1. Reported CPU time of a real refresh and of a real `/api/snapshot` request,
   from `wrangler tail`.
2. Whether the request handler stays under 10 ms.
