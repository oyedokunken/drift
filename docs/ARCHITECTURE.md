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

Version 0.1.0 covered the Tube lines only. The Elizabeth line fit the CPU budget but
its typical headway on the first look was 12.7 minutes with a 30 minute spread across
platforms, against a 15 minute threshold, so the wide gaps rule could not be trusted on
it. Version 0.2.0 adds the Elizabeth line, the DLR and the Overground with a rule set per
mode (wide gaps stays off for the Elizabeth line and the Overground), and buses on
demand. See "Version 0.2.0" at the end of this file.

## Components

```
apps/web         React app. Fetches /api/snapshot, validates it, renders.
apps/worker      Worker: fetch handler (/api/*, static assets), scheduled
                 handler (cron), Durable Object (refresh, summary store and
                 the on demand bus checks).
packages/engine  Pure: summarise(predictions), evaluate(statuses,
                 summaries, now) and evaluateBus(check). Mode profiles in
                 config.ts. No I/O, no clock.
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
- **The drift track is a measurement.** It fills to the observed train count (or gap in
  minutes) and marks the engine's threshold from `config.ts`, with the rule in words
  beneath. It is omitted when there is no honest comparison: no live data, closed
  hours, or the one sided direction case.
- **Sample mode.** `?sample=1` builds a snapshot with the real engine from hand built
  inputs, under a persistent banner and with no network request. The query string is
  parsed with Zod and only the exact value `1` turns it on.
- **Nothing visible sits under the hero while loading.** The band is sized like a real
  headline, which cut layout shift from 0.217 to about 0.06.
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

## Measured on the deployed Worker

CPU time as reported by the platform (`wrangler tail`), on 2026-11-08 against live TfL data:

| Invocation                                      | CPU         | Wall time     |
| ----------------------------------------------- | ----------- | ------------- |
| Cron handler (hands off to the Durable Object)  | 1 to 2 ms   | 0.4 to 2.6 s  |
| Durable Object refresh (5 parallel TfL fetches) | 53 to 82 ms | 0.3 to 2.1 s  |
| `/api/snapshot`, from the 45 second cache       | 1 to 2 ms   | 7 to 22 ms    |
| `/api/snapshot`, built from scratch             | 8 to 19 ms  | 180 to 290 ms |
| Static page                                     | 0 to 2 ms   | 12 to 157 ms  |

Every refresh updated all 11 lines with none failing.

What this means, without overstating it:

- The refresh costs far more than the documented 10 ms, and was not stopped. It runs in
  a Durable Object, whose documented default is 30 seconds. This is the part of the
  design that depends on the Durable Object limit, and it has headroom of several times.
- A request that has to build the snapshot from scratch can exceed 10 ms (it did, up to
  19 ms), and Cloudflare did not enforce the documented free tier figure on it. The
  45 second cache makes that the rare case: most requests cost 1 to 2 ms. If enforcement
  were ever applied, the first request after each cache expiry in each location would be
  the one at risk, and the fix would be to have the cron refresh also write the finished
  snapshot so the request path only reads it.
- The Elizabeth line was not added. Its parse cost would fit, but its train spacing is
  too irregular for the wide gaps rule (see Scope).

## Version 0.2.0: more modes and buses

### Modes

`config.ts` holds one `ModeProfile` per mode: the lookahead, the thresholds, whether the
feed carries usable vehicle ids, which rules are on, and the service window. The rules
read the profile and the engine is one engine. The line ids are in `packages/shared`,
with `modeOfLine` and a `mode` field on every verdict (defaulting to `tube`, so a
snapshot stored before this still parses). `docs/RULES.md` has the profile per mode and
the data behind each choice.

### The refresh, in two phases

The refresh now covers 19 lines, not 11. Its cost is parsing, set by feed size. Measured
in Node (`docs/API-NOTES.md`), the Tube groups take about 30 ms and the other modes about
30 ms (the Elizabeth line alone 10 ms for 1.3 MB). On Cloudflare the Tube groups were
53 to 82 ms, about twice the Node figure, so one refresh of all 19 lines would be about
110 to 160 ms. That is inside the Durable Object's documented 30 seconds, but it is
double what ran live in 0.1.0, and it was not measured on Cloudflare.

So the cron tick alternates between two sets of groups by minute parity: the Tube groups
on one tick and five groups for the other modes on the next (`REFRESH_PHASES` in
`apps/worker/src/tfl.ts`). Each tick then parses about what the Tube did alone in 0.1.0.
Every line is refreshed at least every two minutes, inside the engine's four minute
freshness limit. The Tube is now refreshed every two minutes, not every minute, which
costs nothing real because TfL itself serves a response for up to 60 seconds. A cold
start, with empty storage, refreshes every group at once. Summaries stored before the
deploy still parse, so the Tube shows at once and the new lines read "not enough data"
for at most two minutes.

The status call grows from about 13 KB to about 23 KB, since it now asks for four modes.
That is the part of the request path that changed, and it is still a single small call.

### Buses, on demand

```
GET /api/bus/:route
  Worker: validate the route with Zod (typed 400), then ask the Durable Object
  Durable Object (everything heavy lives here):
    route list   ids and names only, refreshed daily (348 KB, 675 routes)
    not in list  typed 404 with no call to TfL
    cached       reused for 45 seconds
    in flight    concurrent checks of one route share one fetch
    budget       120 TfL requests per rolling minute, then the cached result or a typed 429
    fetch        status and arrivals together, parse, summarise, evaluateBus
    store        last good result per route, at most 200 routes (least recently used out)
    failure      the last good result marked stale, or a typed 503
```

The request budget: TfL allows 500 requests a minute for the key. The cron refresh makes
10 a minute, a snapshot at most a few, and a bus check costs two (status and arrivals),
so 120 a minute for buses is 60 route checks a minute and leaves the key far under its
limit even if every search misses the cache. Searching many different routes cannot
exceed it, and a route that is not in the stored list is refused without spending any.

The arrivals payload for a busy route is about 350 to 390 KB and parses in 3 to 4 ms in
Node, so it is parsed in the Durable Object and never in the request handler. The route
list is parsed there too, once a day.

### Not measured

CPU for the new lines and for a bus check was measured in Node, not on Cloudflare. After
a deploy, `wrangler tail` should be read for the refresh and for a bus check before any
number is claimed.
