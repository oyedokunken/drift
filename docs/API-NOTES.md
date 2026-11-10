# TfL API notes

Findings from calling the live TfL Unified API on 2026-11-08 (a Sunday, about
09:00 London time) for the Tube, and on 2026-11-10 (a Tuesday, 19:00 to 21:00 London
time) for the Elizabeth line, DLR, Overground and buses, with a registered app key.
Everything here was observed, not recalled. Re-check before relying on any number.

## Endpoints used

| Purpose          | Path                                                       | Notes                                                                        |
| ---------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Official status  | `GET /Line/Mode/tube,elizabeth-line,dlr,overground/Status` | About 23 KB, parses in well under 1 ms. Trams come back too and are ignored. |
| Bus route list   | `GET /Line/Mode/bus`                                       | 348 KB, 675 routes. Read daily, ids and names kept.                          |
| One bus route    | `GET /Line/{route}/Status` and `/Arrivals`                 | Fetched together, only when someone searches.                                |
| Live predictions | `GET /Line/{id,id,...}/Arrivals`                           | Comma separated line ids. Full, not capped.                                  |
| Severity codes   | `GET /Line/Meta/Severity`                                  | Reference list, used to design the rules.                                    |

Authentication is `app_key` as a query string parameter. Because it travels in
the URL, every log and error path must redact it.

`GET /Mode/{mode}/Arrivals` looks convenient but is **truncated**: it returned
4 Circle predictions where the per line call returned 116, and 38 Central
predictions where the per line call returned 404. Do not use it.

## Response shapes

### Status

An array with one object per line: `id`, `name`, `modeName`, `lineStatuses`,
plus `disruptions`, `routeSections`, `serviceTypes`, `crowding` that Drift does
not use.

Each `lineStatuses` entry has `statusSeverity` (number),
`statusSeverityDescription`, optional `reason`, `validityPeriods` and
`disruption`.

**A line can carry several statuses at once.** Bakerloo returned both
`6 Severe Delays` and `3 Part Suspended`. The engine must consider all of them,
not just the first.

Line ids: `bakerloo`, `central`, `circle`, `district`, `hammersmith-city`,
`jubilee`, `metropolitan`, `northern`, `piccadilly`, `victoria`,
`waterloo-city`, `elizabeth`, `dlr`.

### Severity codes (tube and Elizabeth line)

```
0 Special Service      7 Reduced Service      14 Change of frequency
1 Closed               8 Bus Service          15 Diverted
2 Suspended            9 Minor Delays         16 Not Running
3 Part Suspended      10 Good Service         17 Issues Reported
4 Planned Closure     11 Part Closed          18 No Issues
5 Part Closure        12 Exit Only            19 Information
6 Severe Delays       13 No Step Free Access  20 Service Closed
```

### Arrivals

An array of predictions. Fields Drift needs: `id`, `vehicleId`, `naptanId`,
`lineId`, `platformName`, `direction`, `timeToStation` (seconds),
`expectedArrival`, `timestamp`. All other fields are ignored.

Observed quirks:

- `direction` is **sometimes missing** (roughly 10 to 30 percent of predictions
  on a busy line). Rules must not depend on it being present.
- `platformName` carries a compass word on most tube lines
  (`Northbound - Platform 1`) but is just `Platform 1` or `A` on DLR and
  Elizabeth line.
- The horizon is about 30 minutes: `timeToStation` topped out at 1831 seconds.
- Prediction `timestamp` can trail the fetch time by up to about 280 seconds.
- A single train appears many times (once per upcoming station), so count
  distinct `vehicleId`, not rows.
- **DLR `vehicleId` is blank**, so distinct vehicles cannot be counted. DLR is
  out of scope for this reason.
- Waterloo and City reported `Planned Closure` yet still returned 2 predictions.

## Size and cost (the important finding)

Arrivals for 12 lines (tube plus Elizabeth) was **4.4 MB and took 4 seconds**
to download. Tube only is 3.3 MB. Per line sizes are roughly 0.1 MB (Circle)
to 1 MB (Elizabeth line).

`JSON.parse` of the full payload measured 20 to 37 ms on a fast desktop.

Cloudflare Workers Free allows **10 ms CPU per invocation**, for HTTP requests
and for Cron Triggers alike, 50 subrequests and 128 MB memory (source:
developers.cloudflare.com/workers/platform/limits). Waiting on a fetch does not
count as CPU, but parsing does. A single invocation cannot parse the full feed.
See `docs/ARCHITECTURE.md` for the chosen response.

## Caching, rate limits and freshness

- Responses carry `Cache-Control: public, max-age=30, s-maxage=60`, so TfL
  itself serves a given response for up to 60 seconds. Polling faster than once
  a minute returns the same data.
- No rate limit headers were returned. TfL's portal documents 500 requests per
  minute for a subscription. Drift's design stays far below that.
- Status changes on the order of minutes. Predictions refresh about every 30
  seconds.

## Errors

- An **invalid app key returns HTTP 429**, not 401 or 403. A bad key therefore
  looks exactly like rate limiting and is retried like it. The retry budget is
  small and capped (3 attempts per call), so a misconfigured key costs a bounded
  number of requests rather than a storm.

## The other modes (2026-11-10)

Mode listing: `GET /Line/Mode/elizabeth-line,dlr,overground,tram/Status`. The line ids,
read from the response and not assumed:

| Mode           | Line ids                                                             |
| -------------- | -------------------------------------------------------------------- |
| elizabeth-line | `elizabeth`                                                          |
| dlr            | `dlr`                                                                |
| overground     | `liberty`, `lioness`, `mildmay`, `suffragette`, `weaver`, `windrush` |
| tram           | `tram` (not used)                                                    |

Status shapes and severity codes are the same as the Tube's. Seen live that evening:
Good Service (10), Minor Delays (9), Severe Delays (6) and Part Closure (5). Mildmay
carried two statuses at once (Severe Delays and Minor Delays), as the District did.

Arrivals, one call per line, at about 19:30 London time:

| Line        | Rows | Size   | Vehicles | Platforms | `vehicleId` | Parse, Zod and summarise (Node) |
| ----------- | ---- | ------ | -------- | --------- | ----------- | ------------------------------- |
| elizabeth   | 1564 | 1.4 MB | 108      | 97        | present     | 10.1 ms                         |
| dlr         | 271  | 231 KB | none     | 98        | **blank**   | 2.1 ms                          |
| liberty     | 16   | 14 KB  | 8        | 3         | present     | 0.2 ms                          |
| lioness     | 292  | 264 KB | 23       | 56        | present     | 2.2 ms                          |
| mildmay     | 820  | 743 KB | 58       | 82        | present     | 6.2 ms                          |
| suffragette | 30   | 27 KB  | 9        | 13        | present     | 0.2 ms                          |
| weaver      | 374  | 338 KB | 40       | 77        | present     | 2.9 ms                          |
| windrush    | 1002 | 904 KB | 87       | 74        | present     | 6.5 ms                          |

The Node figures are wall time of the worker's own `fetchGroupPredictions` plus
`summarise`, median of 14 runs on a busy Windows laptop. The Tube groups total about
30 ms by the same method, and the platform reported 53 to 82 ms for them on Cloudflare
(see `docs/ARCHITECTURE.md`), so Cloudflare ran about twice the Node figure. Nothing
for the new lines was measured on Cloudflare.

Things that differ from the Tube:

- **DLR `vehicleId` is blank on every prediction**, so distinct trains cannot be counted.
  The prediction `id` is shared by every row at a platform, and each row is one train,
  with up to three per platform. Drift treats each prediction at a platform as a train,
  told apart by when it is due.
- **Lookahead is longer than the Tube's 30 minutes.** The largest `timeToStation` was
  1758 s on the DLR and about 7160 s (two hours) on the Elizabeth line and the
  Overground. Drift still reads 30 minutes ahead everywhere, which is its own choice.
- **`direction` is empty on a share of rows**: 320 of 1564 on the Elizabeth line, 161 of
  820 on Mildmay, 3 of 271 on the DLR.
- **`platformName`** is `Platform N`, with `Platform Unknown` on some Mildmay rows.
- The Elizabeth line took 4.5 seconds to download. The others took 0.3 to 2 seconds.

## Buses (2026-11-10)

- **Route list.** `GET /Line/Mode/bus` returned 348 KB for 675 routes in 3 seconds and
  re-parses in about 2.5 ms in Node. Every id was one to four letters or digits (`1`,
  `207`, `W11`, `N207`, `X26`). 64 were night routes starting with `N`. The `lineStatuses`
  field in this listing is empty, so a route's status needs its own call.
- **Status.** `GET /Line/207/Status` returns one line with one or more statuses. Seen:
  Good Service (10) on routes 207, 490 and 73, and Special Service (0) on routes 18, W11
  and N18. Bus status is thin: it was one of those two.
- **Arrivals.** `GET /Line/207/Arrivals` returned 385 rows, 350 KB, 90 stops, 22
  vehicles and a largest `timeToStation` of 1835 s, so the lookahead is about 30 minutes
  as on the Tube. Route 18 returned 427 rows (390 KB), W11 46 to 53 (49 KB), 490 about
  200 (186 KB). `vehicleId` is the registration (`YX17NVB`), `platformName` is the stop
  letter and was the string `null` on some stops, `direction` is inbound or outbound.
  A download took 0.2 to 3 seconds.
- **Night route outside its hours.** `N207` returned `[]` (2 bytes) at 19:50 and
  `Good Service`. An empty list is a valid answer, not an error.
- **Unknown route.** `GET /Line/ZZZ/Arrivals` and `/Status` both returned HTTP 404 with a
  JSON error body, and so did `207;drop`. Drift never sends either: the route is checked
  against the stored list first.
- **Per stop waits on ten healthy routes** (207, 18, 490, W11, 73, 25, 5, 36, H98, E1):
  median wait 3.9 to 12.1 minutes, median gap 3.6 to 12.0. Stops waiting 20 minutes or
  more: 0 on seven routes, 1 of 85 (490), 1 of 106 (36), 7 of 91 (18, 7.7 percent) and
  5 of 26 (W11, 19 percent). That is where the bus long wait share came from.

## Fixtures

Sanitised captures live in `packages/engine/fixtures/`. They contain no key
(the key only ever appears in request URLs, never in bodies) and were checked
for it before being committed. `predictions-2026-11-10-evening-other-modes.json` and
`status-2026-11-10-evening-other-modes.json` hold the Elizabeth line, DLR and Overground
at 19:28 London time on a Tuesday, reduced to the fields Drift uses and to the 30 minute
lookahead. The DLR rows keep their blank vehicle ids. Mildmay is on Severe and Minor
Delays and Suffragette on Part Closure in that capture, which was a real disruption.
