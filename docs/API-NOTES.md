# TfL API notes

Findings from calling the live TfL Unified API on 2026-11-08 (a Sunday, about
09:00 London time) with a registered app key. Everything here was observed, not
recalled. Re-check before relying on any number.

## Endpoints used

| Purpose          | Path                                            | Notes                                       |
| ---------------- | ----------------------------------------------- | ------------------------------------------- |
| Official status  | `GET /Line/Mode/tube,elizabeth-line,dlr/Status` | About 13 KB, parses in well under 1 ms.     |
| Live predictions | `GET /Line/{id,id,...}/Arrivals`                | Comma separated line ids. Full, not capped. |
| Severity codes   | `GET /Line/Meta/Severity`                       | Reference list, used to design the rules.   |

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

## Fixtures

Sanitised captures live in `packages/engine/fixtures/`. They contain no key
(the key only ever appears in request URLs, never in bodies) and were checked
for it before being committed.
