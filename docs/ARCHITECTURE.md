# Architecture

Drift is one Cloudflare Worker on the free tier. It serves the built React app
as static assets and answers `/api/*`. Same origin, so no CORS. This page
records the design and, in particular, the constraint that shaped it.

## The constraint

Measured on 2026-11-08 (details in `docs/API-NOTES.md`):

- Arrivals for the Tube is **3.3 MB** (4.4 MB with the Elizabeth line) and
  takes several seconds to download.
- `JSON.parse` of that payload costs **20 to 37 ms** of CPU on a fast desktop.
- Cloudflare Workers Free allows **10 ms of CPU per invocation**, for HTTP
  requests and Cron Triggers alike. Time spent waiting on a fetch is free;
  parsing is not.
- Workers KV on the free plan allows **1,000 writes per day**, so it cannot
  hold state that changes every minute.

A single invocation therefore cannot fetch, parse and validate the full feed,
and KV cannot store a per minute result.

## The decision

Split the work by line and keep the request path cheap.

1. **Cron fan-out.** Five Cron Triggers run every minute. Each owns a fixed
   group of lines, fetches `Line/{ids}/Arrivals` for just that group (roughly
   0.5 to 0.9 MB), validates the predictions, and reduces them to one tiny
   summary per line using the engine's pure `summarise()`.
2. **State in a Durable Object.** The summaries are written to a SQLite backed
   Durable Object (available on the free plan), one row per line with its own
   `fetchedAt`. KV is not used for the hot path because of its write cap.
3. **Cheap request path.** `GET /api/snapshot` fetches the small status feed
   (about 13 KB, under 1 ms to parse), reads the summaries from the Durable
   Object, runs the engine, and returns one snapshot. A 45 second Cache API
   layer keeps TfL and Durable Object traffic independent of visitor count.

Starting groups, balanced by Sunday morning prediction counts (peak hours are
larger, so these may be rebalanced after measuring):

| Trigger | Lines                                    |
| ------- | ---------------------------------------- |
| A       | northern                                 |
| B       | piccadilly, victoria                     |
| C       | district, circle, jubilee, waterloo-city |
| D       | central, bakerloo                        |
| E       | metropolitan, hammersmith-city           |

Scope is the Tube only. The Elizabeth line (1 MB on its own) is added only if
its measured CPU on a deployed Worker fits the 10 ms budget.

## Components

```
apps/web         React app. Fetches /api/snapshot, validates it, renders.
apps/worker      Worker: fetch handler (/api/*, static assets), scheduled
                 handler (cron), Durable Object (summary store).
packages/engine  Pure: summarise(predictions) and evaluate(statuses,
                 summaries, now). No I/O, no clock.
packages/shared  Zod schemas and types used by worker and web.
```

## Data flow

```
 every minute, per group             on each visitor request
 TfL Arrivals --> parse + Zod        TfL Status (13 KB) ----+
      |                                                      v
      v                              Durable Object --> evaluate() --> snapshot
 summarise() --> Durable Object          (summaries)        (engine)       |
                                                                           v
                                        Cache API (45 s) --> browser (Zod) --> UI
```

## Resilience model

- **Timeouts and retries**: every upstream call has a 5 second AbortController
  timeout and retries with exponential backoff and jitter on network errors,
  5xx and 429, honouring `Retry-After`, with a small capped attempt count.
- **Coalescing**: concurrent requests in one isolate share one in flight
  status fetch.
- **Last known good, per line**: each line's summary keeps its own `fetchedAt`.
  If a group's fetch fails, the previous summaries stay and age. The engine
  treats summaries older than 240 seconds as `unknown`, so old data never
  produces a false alarm.
- **Status feed down**: the Worker serves the last snapshot it built (also kept
  in the Durable Object) marked `stale: true` with its age. With no snapshot at
  all it returns a typed 503 body, never a bare 500.
- **Browser**: validates the snapshot with the shared Zod schema, refreshes
  about every 60 seconds, pauses when the tab is hidden, aborts on unmount,
  backs off on failure, and keeps showing the last good data while refreshing.
- **Secrets**: the TfL key is a Cloudflare secret in production and a gitignored
  `.dev.vars` locally. It is redacted from every log and error path, because
  TfL takes it as a query string parameter.

## Trade-offs

- More moving parts than a single fetch and cache. The free tier makes that the
  honest price of live data.
- Data per line can be up to about a minute older than the status feed, which
  is shown to the user as separate freshness.
- The brief suggests KV for the last good snapshot. The Durable Object does
  that job here because KV's free write cap cannot take per minute updates.
- A Durable Object has its own CPU limit, documented as 30 seconds by default
  but not stated separately for the free plan. If a measurement on a deployed
  Worker shows it is generous enough, the five way split could collapse into a
  single refresh. That would be a simplification to evaluate, not an assumption.

## Open measurements (Stage 5 and 7)

1. CPU time per cron invocation, per group, at a weekday peak.
2. Whether the Elizabeth line fits.
3. Durable Object CPU headroom on the free plan.
