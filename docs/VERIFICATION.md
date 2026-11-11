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

| Label                     | London time                     | Status                                       |
| ------------------------- | ------------------------------- | -------------------------------------------- |
| Evening                   | about 19:00, Monday 2026-11-09  | not run, the scheduled job never fired       |
| Evening (replacement)     | 19:15, Tuesday 2026-11-10       | done, see below                              |
| Late evening              | about 23:00, Monday 2026-11-09  | not run, the scheduled job never fired       |
| Early morning             | about 05:30, Tuesday 2026-11-10 | not run, the scheduled job never fired       |
| Weekend, Saturday daytime | about 11:00, 2026-11-14         | pending, falls after the 2026-11-13 handover |
| Weekend, Sunday evening   | about 21:30, 2026-11-15         | pending, falls after the 2026-11-13 handover |

The three Monday and Tuesday jobs were session only and did not run, so no result was
invented for them.

#### Evening, 19:15 London, Tuesday 2026-11-10

| Line             | Official                       | Verdict | Rule                | Trains in 15 min | Platforms | Long waits | Median gap |
| ---------------- | ------------------------------ | ------- | ------------------- | ---------------- | --------- | ---------- | ---------- |
| Bakerloo         | Good Service                   | in step | in-step             | 25               | 49        | 0          | 5 min      |
| Central          | Minor Delays                   | in step | in-step             | 59               | 95        | 0          | 4 min      |
| Circle           | Good Service                   | in step | in-step             | 12               | 48        | 1          | 7 min      |
| District         | Severe Delays and Minor Delays | unknown | partial-status      | 51               | 112       | 4          | 5 min      |
| Hammersmith City | Good Service                   | in step | in-step             | 33               | 83        | 1          | 9 min      |
| Jubilee          | Minor Delays                   | in step | in-step             | 37               | 55        | 0          | 3 min      |
| Metropolitan     | Good Service                   | in step | in-step             | 36               | 70        | 2          | 4 min      |
| Northern         | Minor Delays                   | in step | in-step             | 88               | 113       | 0          | 3 min      |
| Piccadilly       | Good Service                   | in step | in-step             | 58               | 106       | 0          | 3 min      |
| Victoria         | Severe Delays                  | unknown | delays-unverifiable | 25               | 30        | 0          | 2 min      |
| Waterloo & City  | Good Service                   | in step | in-step             | 2                | 2         | 0          | 3 min      |

No rule fired, so there is no real problem or false alarm to classify. This is the first
snapshot with a real disruption: Victoria on Severe Delays and District on Severe and
Minor Delays. Drift deliberately says "unknown" for delay statuses it cannot verify from
arrivals, and it did, rather than guessing. Victoria still showed a 2 minute median gap,
which is normal service, so the feed does not obviously contradict the status either way.

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

## More modes and buses, checked live (2026-11-10)

The real engine from this branch was run against the live TfL feed with a script outside
the repository (it reads the key from the gitignored `.dev.vars` and never prints it).
Official statuses came from the Line Status API. They were compared with
`tfl.gov.uk/tube-dlr-overground/status/` fetched a few minutes later, and matched, with
one difference from the time gap (the District had moved from Severe and Minor Delays to
Minor Delays). A real disruption was on the network at the time:

- Mildmay: severe delays between Willesden Junction and Clapham Junction (a signal
  failure at Shepherd's Bush) and minor delays on the whole line.
- Suffragette: no service between South Tottenham and Barking Riverside.
- Victoria: severe delays (a track fault at Brixton). Central, District, Jubilee and
  Northern on minor delays.

### Band 1: evening, 19:57 London, Tuesday 2026-11-10

| Line             | Mode           | Official                       | Verdict | Rule                | Platforms | Long waits | Median gap |
| ---------------- | -------------- | ------------------------------ | ------- | ------------------- | --------- | ---------- | ---------- |
| Bakerloo         | tube           | Good Service                   | in step | in-step             | 47        | 0          | 4 min      |
| Central          | tube           | Minor Delays                   | in step | in-step             | 94        | 0          | 3 min      |
| Circle           | tube           | Good Service                   | in step | in-step             | 48        | 0          | 9 min      |
| District         | tube           | Severe Delays and Minor Delays | unknown | partial-status      | 116       | 0          | 5 min      |
| DLR              | dlr            | Good Service                   | in step | in-step             | 98        | 1          | 5 min      |
| Elizabeth line   | elizabeth-line | Good Service                   | in step | in-step             | 91        | 2          | 6 min      |
| Hammersmith City | tube           | Good Service                   | in step | in-step             | 84        | 4          | 8 min      |
| Jubilee          | tube           | Minor Delays                   | in step | in-step             | 55        | 0          | 2 min      |
| Liberty          | overground     | Good Service                   | unknown | not-measurable      | 3         | 0          | 0 min      |
| Lioness          | overground     | Good Service                   | unknown | not-measurable      | 40        | 0          | 15 min     |
| Metropolitan     | tube           | Good Service                   | in step | in-step             | 77        | 3          | 5 min      |
| Mildmay          | overground     | Severe Delays and Minor Delays | unknown | partial-status      | 62        | 0          | 5 min      |
| Northern         | tube           | Minor Delays                   | in step | in-step             | 108       | 0          | 2 min      |
| Piccadilly       | tube           | Good Service                   | in step | in-step             | 104       | 0          | 4 min      |
| Suffragette      | overground     | Part Closure                   | unknown | partial-status      | 11        | 4          | 8 min      |
| Victoria         | tube           | Severe Delays                  | unknown | delays-unverifiable | 32        | 0          | 2 min      |
| Waterloo & City  | tube           | Good Service                   | in step | in-step             | 3         | 0          | 3 min      |
| Weaver           | overground     | Good Service                   | unknown | not-measurable      | 54        | 2          | 15 min     |
| Windrush         | overground     | Good Service                   | in step | in-step             | 61        | 0          | 4 min      |

**No rule fired on any of the 19 lines, so there is no real problem or false alarm to
classify for the lines.** What the run does show:

- **Weaver and Lioness are the reason wide gaps is off for the Overground.** Both sat at
  a median gap of 15 minutes on Good Service. With the Tube's 15 minute bar, Weaver would
  have fired a wide gaps mismatch on a healthy line. They resolve to unknown instead.
  This is the one place where a live check changed a design decision.
- **Suffragette** is the only line with long waits at all (4 of 11 platforms), which is
  consistent with the real part closure and is held back by its status: a partial status is
  unknown by design.
- **Mildmay and Victoria** were on severe delays with trains running normally by the
  counts (Mildmay 62 platforms, Victoria a 2 minute median gap). Drift does not call that a
  mismatch, because delayed trains still run: unknown, by design.
- **DLR** was judged in step from per platform waits and gaps with no vehicle count, on
  98 platforms.
- **Elizabeth line** was in step. 2 of 91 platforms waited 20 minutes, against the 40
  percent bar.

### Bus routes, checked at the same time

Run with no earlier reading of the route, so the no buses rule could not fire.

| Route | Official        | Verdict | Rule           | Stops | Long waits | Median gap | Why                                            |
| ----- | --------------- | ------- | -------------- | ----- | ---------- | ---------- | ---------------------------------------------- |
| 207   | Good Service    | in step | in-step        | 90    | 5          | 5 min      | A very frequent route, 385 predictions         |
| 73    | Good Service    | in step | in-step        | 63    | 0          | 6 min      | A frequent route                               |
| 490   | Good Service    | in step | in-step        | 84    | 3          | 9 min      | A less frequent route, a bus about every 9 min |
| 18    | Special Service | unknown | partial-status | 93    | 3          | 5 min      | Special Service is a partial status            |
| W11   | Special Service | unknown | partial-status | 23    | 6          | 11 min     | Special Service, and only 23 stops             |
| N207  | Good Service    | unknown | not-measurable | 0     | 0          | none       | A night route, 0 predictions at 19:57          |
| N18   | Special Service | unknown | partial-status | 0     | 0          | none       | A night route, 0 predictions at 19:57          |

No bus rule fired, so again nothing to classify. The three routes of different frequency
asked for (a very frequent day route, 207, a less frequent one, 490, and night routes,
N207 and N18) all resolved sensibly. The night routes were the least informative: a night
route is always unknown, and at 19:57 it had no buses to show.

### Band 2: 21:06 London, Tuesday 2026-11-10

Run after the deploy, as the band 2 check, about an hour after band 1. The late night run
planned for about 23:40 London depends on this session staying open, so treat it as extra.

| Line             | Mode           | Official      | Verdict | Rule                | Platforms | Long waits | Median gap |
| ---------------- | -------------- | ------------- | ------- | ------------------- | --------- | ---------- | ---------- |
| Bakerloo         | tube           | Good Service  | in step | in-step             | 49        | 0          | 4 min      |
| Central          | tube           | Minor Delays  | in step | in-step             | 87        | 0          | 4 min      |
| Circle           | tube           | Good Service  | in step | in-step             | 49        | 0          | 10 min     |
| District         | tube           | Minor Delays  | in step | in-step             | 111       | 1          | 4 min      |
| DLR              | dlr            | Good Service  | in step | in-step             | 97        | 1          | 5 min      |
| Elizabeth line   | elizabeth-line | Good Service  | in step | in-step             | 91        | 2          | 7 min      |
| Hammersmith City | tube           | Good Service  | in step | in-step             | 84        | 3          | 9 min      |
| Jubilee          | tube           | Minor Delays  | in step | in-step             | 53        | 0          | 2 min      |
| Liberty          | overground     | Good Service  | unknown | not-measurable      | 3         | 0          | 0 min      |
| Lioness          | overground     | Good Service  | unknown | not-measurable      | 40        | 0          | 15 min     |
| Metropolitan     | tube           | Good Service  | in step | in-step             | 72        | 0          | 5 min      |
| Mildmay          | overground     | Minor Delays  | in step | in-step             | 61        | 0          | 5 min      |
| Northern         | tube           | Good Service  | in step | in-step             | 112       | 0          | 3 min      |
| Piccadilly       | tube           | Good Service  | in step | in-step             | 107       | 1          | 5 min      |
| Suffragette      | overground     | Part Closure  | unknown | partial-status      | 11        | 0          | 14 min     |
| Victoria         | tube           | Severe Delays | unknown | delays-unverifiable | 31        | 0          | 4 min      |
| Waterloo & City  | tube           | Good Service  | in step | in-step             | 3         | 0          | 26 min     |
| Weaver           | overground     | Good Service  | unknown | not-measurable      | 50        | 4          | 15 min     |
| Windrush         | overground     | Good Service  | in step | in-step             | 60        | 0          | 3 min      |

| Route | Official        | Verdict | Rule           | Stops | Long waits | Median gap | Why                                     |
| ----- | --------------- | ------- | -------------- | ----- | ---------- | ---------- | --------------------------------------- |
| 207   | Good Service    | in step | in-step        | 90    | 0          | 5 min      | A very frequent route                   |
| 73    | Good Service    | in step | in-step        | 63    | 0          | 7 min      | A frequent route                        |
| 490   | Good Service    | unknown | not-measurable | 85    | 1          | 15 min     | Now 15 minutes apart, so too infrequent |
| W11   | Special Service | unknown | partial-status | 25    | 7          | 9 min      | Special Service, and only 25 stops      |
| N207  | Good Service    | unknown | not-measurable | 0     | 0          | none       | A night route, no buses at 21:06        |
| N18   | Special Service | unknown | partial-status | 0     | 0          | none       | A night route, no buses at 21:06        |

**No rule fired on 19 lines or 6 bus routes, so there is nothing to classify as a real
problem or a false alarm.** Two things worth noting. Route 490 was 9 minutes apart in band 1
and 15 here, and the bus rule correctly stopped judging it as it became infrequent. Mildmay's
severe delays had cleared to minor delays, and it is in step.

### Morning: 08:18 London, Wednesday 2026-11-11

This was meant to be two checks, a late night one at about 23:40 and a morning one at about
05:30. Both scheduled jobs only fired at 08:18, because the session that held them was not
running at those times. So neither slot was checked and the night routes were not seen
running. What was run is one check at 08:18, which is a new band: the morning rush hour.

| Line             | Mode           | Official                         | Verdict | Rule           | Platforms | Long waits | Median gap |
| ---------------- | -------------- | -------------------------------- | ------- | -------------- | --------- | ---------- | ---------- |
| Bakerloo         | tube           | Good Service                     | in step | in-step        | 50        | 0          | 5 min      |
| Central          | tube           | Minor Delays                     | in step | in-step        | 91        | 0          | 3 min      |
| Circle           | tube           | Good Service                     | in step | in-step        | 46        | 0          | 9 min      |
| District         | tube           | Minor Delays                     | in step | in-step        | 107       | 2          | 4 min      |
| DLR              | dlr            | Good Service                     | in step | in-step        | 98        | 0          | 5 min      |
| Elizabeth line   | elizabeth-line | Severe Delays and Part Suspended | unknown | partial-status | 100       | 5          | 5 min      |
| Hammersmith City | tube           | Good Service                     | in step | in-step        | 86        | 5          | 8 min      |
| Jubilee          | tube           | Good Service                     | in step | in-step        | 56        | 0          | 2 min      |
| Liberty          | overground     | Good Service                     | unknown | not-measurable | 3         | 0          | 17 min     |
| Lioness          | overground     | Good Service                     | unknown | not-measurable | 37        | 1          | 15 min     |
| Metropolitan     | tube           | Minor Delays                     | in step | in-step        | 71        | 3          | 8 min      |
| Mildmay          | overground     | Good Service                     | in step | in-step        | 58        | 2          | 7 min      |
| Northern         | tube           | Minor Delays                     | in step | in-step        | 113       | 0          | 2 min      |
| Piccadilly       | tube           | Good Service                     | in step | in-step        | 106       | 0          | 5 min      |
| Suffragette      | overground     | Minor Delays                     | unknown | not-measurable | 25        | 0          | 15 min     |
| Victoria         | tube           | Good Service                     | in step | in-step        | 32        | 0          | 2 min      |
| Waterloo & City  | tube           | Good Service                     | in step | in-step        | 4         | 0          | 2 min      |
| Weaver           | overground     | Good Service                     | unknown | not-measurable | 53        | 5          | 11 min     |
| Windrush         | overground     | Good Service                     | in step | in-step        | 56        | 0          | 9 min      |

| Route | Official                | Verdict | Rule           | Stops | Long waits | Median gap | Why                                         |
| ----- | ----------------------- | ------- | -------------- | ----- | ---------- | ---------- | ------------------------------------------- |
| 207   | Good Service            | in step | in-step        | 90    | 0          | 6 min      | A very frequent route                       |
| 73    | Good Service            | in step | in-step        | 63    | 0          | 6 min      | A frequent route                            |
| 490   | Good Service            | in step | in-step        | 82    | 2          | 7 min      | Frequent again, 15 minutes apart last night |
| 18    | Special Service         | unknown | partial-status | 93    | 0          | 4 min      | Special Service is a partial status         |
| N207  | Good Service            | unknown | not-measurable | 0     | 0          | none       | A night route, over for the morning         |
| N18   | Special Service (twice) | unknown | partial-status | 0     | 0          | none       | A night route, over for the morning         |

**No rule fired on 19 lines or 6 bus routes, so there is nothing to classify as a real
problem or a false alarm.** What the run shows:

- **A real disruption was on the network and Drift handled it as designed.** The Elizabeth
  line was on Severe Delays and Part Suspended, and TfL's status page, fetched a few minutes
  later, said the same: no service between Paddington and Reading or Heathrow while
  emergency services dealt with a casualty on the track, and severe delays between
  Paddington and Abbey Wood. Drift reads a partial status as unknown, low confidence, so it
  did not call a mismatch. The counts agree with the disruption: 5 of 100 platforms
  waiting 20 minutes or more, against 2 of 91 in the evening.
- **Suffragette** was on Minor Delays (the page: an earlier late finish of engineering work)
  and, as an Overground line, is judged only on no trains, so it reads not enough data.
- Central, District, Metropolitan and Northern were on Minor Delays and in step, as the
  page said.
- This is the first band with the Tube at the morning peak (1.9 to 3 minute median gaps on
  the busiest lines), and the weekday window was open for every mode.

Status of the bands: band 1 (19:57), band 2 (21:06) and the morning rush hour (08:18) are
done. The late night and 05:30 slots were missed, so the night routes and the start of
service are unchecked, and no weekend band has run, so the Sunday windows are still
unproven.

### The Worker run locally with real storage (2026-11-10, 20:09 to 20:15 London)

`wrangler dev` with real Durable Object storage and the live TfL API, no deploy:

- `/api/bus/207` 200 in 5.5 s on the first call (it also fetched the route list), then
  200 in 21 ms from the cache. `w11` was normalised to `W11`. `9999` answered 404
  `route_not_found`. `<script>` and `12345` answered 400 `invalid_route` without echoing
  the input. `/api/bus/207/x` answered 404, a POST 405. Headers: `no-store` and the CSP.
- Both refresh phases ran: 8 lines for the other modes and 11 for the Tube. This run found
  a real bug, a Tube tick joining a refresh of the other lines and never updating, fixed in
  `refresh-runs.ts`.
- `/api/snapshot` then held 19 verdicts: Tube 10 in step and 1 unknown (Victoria, Severe
  Delays), DLR, Elizabeth line and Windrush in step, five Overground lines unknown.
- On empty storage the 7 second cold start cap was too short for 19 lines (see the README).
- The key appeared in no log line.

### Verified, and not

- **Verified:** the new rules and profiles stay quiet on a healthy evening across all
  modes, the real DLR feed has blank vehicle ids and is judged without counting trains,
  the Overground low frequency lines resolve to unknown rather than raising an alarm, and
  the official statuses match TfL's public page.
- **Not verified:** that any new rule fires correctly in a real disruption (none did), the
  Sunday windows, the night routes while running, and the Cloudflare CPU for the new lines
  and for a bus check.

## The deployed site (2026-11-10, version 360e740e, deployed 21:00 London)

Deployed with `pnpm deploy` from `main` after merging pull request #2. Previous version
`447ba5ce` was kept as the rollback target. `wrangler tail` ran during the deploy and for
five minutes after.

Live checks with curl:

| Request          | Result                                                                           |
| ---------------- | -------------------------------------------------------------------------------- |
| `/`              | 200, HTML                                                                        |
| `/api/health`    | 200 `{"ok":true}`                                                                |
| `/api/snapshot`  | 200, 19 verdicts, fresh (10 Tube in step, DLR, Elizabeth line, Windrush in step) |
| `/api/bus/207`   | 200, a verdict, in step (first call 3.3 s, it also fetched the route list)       |
| `/api/bus/ZZZ9`  | 404 `route_not_found`, typed                                                     |
| `/api/bus/207!!` | 400 `invalid_route`, typed                                                       |

Right after the deploy the snapshot read "not enough data" for every line, as expected: the
summaries stored by 0.1.0 lack the new `longWaitPlatforms` field and are skipped. The
cold start refresh hit the 7 second cap (TfL timed out on some of the ten parallel calls and
was retried), the refresh finished anyway and all 19 lines were fresh about 8 seconds later.

CPU as reported by `wrangler tail`, Cloudflare, not Node:

| Invocation                                          | CPU          | Wall time    |
| --------------------------------------------------- | ------------ | ------------ |
| Durable Object refresh, Tube phase (11 lines)       | 67 to 103 ms | 1.6 to 5.5 s |
| Durable Object refresh, other modes phase (8 lines) | 63 to 86 ms  | 1.1 to 8.3 s |
| Durable Object refresh, all 19 lines, cold start    | 146 ms       | 7 s          |
| 0.1.0 refresh of 11 Tube lines, for comparison      | 75 ms        | 3.6 s        |
| Bus check in the Durable Object, cached             | 0 to 1 ms    | 10 to 14 ms  |
| Bus check, a route fetched (207, 73, 490, W11, 18)  | 4 to 16 ms   | 0.2 to 5.5 s |
| Bus check, first ever (route list plus route)       | 65 ms        | 2.6 s        |
| `/api/snapshot`, cold start                         | 11 ms        | 7.6 s        |
| `/api/snapshot`, cached, and `/api/bus/*` handler   | 1 to 10 ms   | 2 to 600 ms  |
| Cron handler                                        | 1 to 2 ms    | 1 to 8 s     |

No invocation reported an error or an exception, and every outcome was `ok`. The phase split
worked: each tick is about the same cost as the 0.1.0 refresh. A bus check of a large route
used up to 16 ms of CPU, which is above the documented 10 ms free plan figure for a request,
but it runs in the Durable Object, whose documented limit is far higher, and Cloudflare did
not stop it. That is an observation, as in `docs/ARCHITECTURE.md`, not a guarantee. One
`canceled` outcome appeared on the cold start refresh RPC after the request that started it
gave up at 7 seconds; the refresh itself still logged `refreshed: 19`.

### Lighthouse on the live site (2026-11-10, after the deploy)

Mobile profile, three runs, headless Chrome on a busy Windows laptop:

| Run | Performance | Accessibility | Best Practices | SEO | LCP   | CLS | TBT    |
| --- | ----------- | ------------- | -------------- | --- | ----- | --- | ------ |
| 1   | 93          | 100           | 100            | 100 | 2.2 s | 0   | 220 ms |
| 2   | 97          | 100           | 100            | 100 | 2.1 s | 0   | 130 ms |
| 3   | 90          | 100           | 100            | 100 | 2.1 s | 0   | 340 ms |

Median: Performance 93, Accessibility 100, Best Practices 100, SEO 100. 0.1.0 scored 98 on
Performance on 2026-11-08. The difference is within the spread of these three runs, so it
is not shown to be real, but it is not shown to be nothing either.

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
