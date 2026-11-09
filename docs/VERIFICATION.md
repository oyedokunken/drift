# Verification record

What was checked, when, and how it came out. All times are UTC on 2026-11-08, a
Sunday. The site checked is the deployed one, https://drift.oyedokunken.workers.dev.

Two comparisons were repeated at three points in time:

1. **Official status.** Drift's `official` label for every line, against what TfL's
   own public status page (`tfl.gov.uk/tube-dlr-overground/status/`) displayed at the
   same moment.
2. **Observed trains.** The number of distinct trains due within 15 minutes that Drift
   reported, against a recount made straight from TfL's raw arrivals feed with
   separate, independent code (one request for all 11 lines, counting distinct vehicle
   ids with a time to station between 0 and 900 seconds).

## Checks against TfL's pages

| Check | Time  | Official status matches TfL's page | Largest train count difference | Verdicts             |
| ----- | ----- | ---------------------------------- | ------------------------------ | -------------------- |
| 1     | 11:40 | Yes, all 11 lines                  | 3 trains (Piccadilly, 55 v 52) | 9 in step, 2 unknown |
| 2     | 11:55 | Yes, all 11 lines                  | 2 trains                       | 9 in step, 2 unknown |
| 3     | 12:09 | Yes, all 11 lines                  | 6 trains (Piccadilly, 57 v 51) | 9 in step, 2 unknown |

On each occasion TfL's page showed Bakerloo as severe delays and part suspended,
Central as minor delays, Waterloo and City as planned closure, and good service on all
other lines, which is what Drift reported.

**On the train count differences.** They were never more than about 10 percent of a
line's count, and never changed a verdict. The two figures are not read at the same
instant: TfL caches each distinct request for up to 60 seconds, and Drift's five group
requests and the single 11 line recount can land on different cache entries. At check
3 Drift's train data was only 4 seconds old, so the gap came from TfL's own caching,
not from Drift holding stale data.

## Verdicts

Every verdict at every check was either "in step" or "unknown". That is right for what
was happening on the network:

- **Bakerloo** (Severe Delays and Part Suspended): unknown, rule `partial-status`.
  TfL's page itself says the line has no service on part of its length, so live train
  counts across the whole line cannot confirm or contradict it. Calling it a mismatch
  would have been a false alarm.
- **Waterloo and City** (Planned Closure): unknown, rule `partial-status`. TfL's page
  says it runs Monday to Friday only, yet its feed still showed 2 predicted trains on a
  Sunday. A reminder of why a planned closure must never be called a mismatch.
- **Central** (Minor Delays, from train cancellations): in step. 49 to 52 trains were
  due within 15 minutes with a typical gap of about 4 minutes, so the line was clearly
  running.
- **The other eight lines** (Good Service): in step, with between 11 trains (Circle,
  the sparsest line) and 74 (Northern) due within 15 minutes.

## Over the whole session

A background sampler recorded every line every ten minutes from 08:57 to the end of
the session (several hours, no failed samples), and kept four spaced raw snapshots.
Across them, no healthy line came near a threshold: the fewest trains due in 15
minutes was 9 (Circle) against a floor of 3, the quietest direction on any line had
5 trains, and the slowest typical headway was 9.8 minutes (Circle) against a bar of 15. No rule fired on a healthy line, so there was no false alarm.

## Failure behaviour

Run on a local Worker against the real TfL API with real persisted storage:

| Situation                          | Result                                                         |
| ---------------------------------- | -------------------------------------------------------------- |
| Valid key                          | 11 of 11 lines refreshed, fresh snapshot                       |
| Invalid key (TfL answers 429)      | Previous snapshot served with `stale: true`, original age kept |
| Invalid key and empty storage      | HTTP 503, typed body, `Retry-After: 30`, never a bare 500      |
| Key in any log, header or response | Never, in any of the above                                     |

## Per platform rules, checked live (2026-11-09)

After the engine changed to measure the wait and gap per platform (rules 3 to 5 in
`docs/RULES.md`), the new engine was run against the live TfL feed at 15:37 London time
on a Monday. Official statuses came from TfL's Line Status API, which is the source of
the public status page, and were compared by eye with
`tfl.gov.uk/tube-dlr-overground/status/` fetched at the same time. Both showed Central
and Metropolitan on Minor Delays and every other Tube line on Good Service.

| Line             | Official     | Verdict | Trains in 15 min | Platforms | Long waits | Median gap |
| ---------------- | ------------ | ------- | ---------------- | --------- | ---------- | ---------- |
| Bakerloo         | Good Service | in step | 23               | 50        | 0          | 5 min      |
| Central          | Minor Delays | in step | 57               | 94        | 0          | 5 min      |
| Circle           | Good Service | in step | 12               | 49        | 0          | 10 min     |
| District         | Good Service | in step | 55               | 118       | 3          | 5 min      |
| Hammersmith City | Good Service | in step | 30               | 79        | 6          | 10 min     |
| Jubilee          | Good Service | in step | 39               | 55        | 0          | 3 min      |
| Metropolitan     | Minor Delays | in step | 25               | 68        | 1          | 7 min      |
| Northern         | Good Service | in step | 73               | 109       | 0          | 3 min      |
| Piccadilly       | Good Service | in step | 55               | 105       | 0          | 5 min      |
| Victoria         | Good Service | in step | 26               | 32        | 0          | 2 min      |
| Waterloo & City  | Good Service | in step | 2                | 3         | 0          | 29 min     |

What this shows:

- **No false alarm** on 11 healthy lines on a weekday afternoon. The worst margins were
  Hammersmith City at 6 of 79 platforms waiting 20 minutes or more (7.6 percent, against
  a 30 percent bar) and a 10 minute median gap on Hammersmith City and Circle (against
  15).
- **Waterloo and City** shows a 29 minute median gap because it has 3 platforms and most show a single
  train inside the window, so the gap is a lower bound. It has fewer than the 5 platforms needed
  to trust a gap, so the verdict is "in step" with medium confidence, which is the
  minimum sample guard doing its job. It is the doubtful case: a two train line is
  always a small sample.
- **No new rule fired for real.** Wide gaps, long waits and no trains are proven by
  end to end tests from raw predictions and by this single live snapshot staying quiet,
  not by a real disruption. This is one snapshot, not a calibration. The thresholds were
  set from the Sunday morning data in `docs/RULES.md` and this check is the first
  weekday data point against them.
- **Service hours for rule 5 (07:00 to 22:00 London time) are unchecked.** I probed TfL's
  per station timetable endpoint (`/Line/{id}/Timetable/{stop}`) on 2026-11-09 and it was
  not quick or reliable enough to trust. It returned data for only 5 of the 11 lines, only
  for the three stations sampled per line, and the first and last departures were
  inconsistent (first trains at 12:00 on weekdays, which is wrong, and Sunday last trains
  between 20:30 and 21:00 at the sampled stations, which looks too early). What it did
  suggest is that weekday, Friday and Saturday last departures run to about 00:13 to 00:56,
  well after 22:00. The Sunday evening end is the open question, so a live check at
  about 21:30 London time on a Sunday is scheduled below. The window is deliberately
  narrow, so the cost of being wrong at the start or end is a missed alarm, not a false
  one, except where a line really stops before 22:00 and its status still reads Good
  Service.

### Scheduled live checks, still to come

Recorded below as each runs, with the rule that fired (if any) and whether it was a real
problem or a false alarm. Each run uses the same code as the branch and the real feed.

| Label                     | London time                     | Status  |
| ------------------------- | ------------------------------- | ------- |
| Evening                   | about 19:00, Monday 2026-11-09  | pending |
| Late evening              | about 23:00, Monday 2026-11-09  | pending |
| Early morning             | about 05:30, Tuesday 2026-11-10 | pending |
| Weekend, Saturday daytime | about 11:00, 2026-11-14         | pending |
| Weekend, Sunday evening   | about 21:30, 2026-11-15         | pending |

### CPU cost of the per platform summary

`summarise` and `evaluate` were timed in Node on the four line fixture (469 predictions),
before and after the change, on a busy Windows laptop, so the figures are noisy:

| Step        | Before                                                              | After                                                       |
| ----------- | ------------------------------------------------------------------- | ----------------------------------------------------------- |
| `summarise` | 1.0 to 1.6 microseconds per prediction (0.5 to 0.65 on a quiet run) | 0.9 to 1.2 microseconds per prediction (0.5 on a quiet run) |
| `evaluate`  | 10 to 19 microseconds per 4 lines                                   | 11 to 15 microseconds per 4 lines                           |

There is no measurable change. At that rate the roughly 4,000 predictions of a full Tube
refresh cost a few milliseconds in `summarise`, against 25 to 45 ms to parse the JSON,
which dominates. This is a local Node measurement, not a Cloudflare one: the change was
not deployed, so no `wrangler tail` CPU figure exists for it yet.

## Not verified, said plainly

- **No real mismatch was seen.** The network was healthy for the whole session, so none
  of the rules fired for real. They are proven by tests and fixtures only.
  Whether the verdicts are right during a real disruption of these kinds is untested.
- **No real suspension was ever seen**, so the flowing while suspended threshold is the
  least proven number.
- **Weekday peak and overnight** were not observed. Everything here is a Sunday
  morning to early afternoon.
- **The outage test was not run on the production site, by decision.** It would have
  meant overwriting the production secret with an invalid one, and the owner chose not
  to do that. The same behaviour was exercised locally as above.
- **A forced upstream timeout** was only covered by unit tests.
- **A physical phone** check was done by the owner on a Samsung S23 5G in Chrome over
  MTN mobile data, using sample mode. Layout was also checked in a mobile emulation at
  320, 375, 768 and 1280 pixels, with no horizontal scrolling at any of them.
