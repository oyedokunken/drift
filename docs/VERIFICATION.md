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

## Not verified, said plainly

- **No real mismatch was seen.** The network was healthy for the whole session, so none
  of the three rules fired for real. They are proven by tests and fixtures only.
  Whether the verdicts are right during a real disruption of these kinds is untested.
- **No real suspension was ever seen**, so the flowing while suspended threshold is the
  least proven number.
- **Weekday peak and overnight** were not observed. Everything here is a Sunday
  morning to early afternoon.
- **The outage test was not run on the production site, by decision.** It would have
  meant overwriting the production secret with an invalid one, and the owner chose not
  to do that. The same behaviour was exercised locally as above.
- **A forced upstream timeout** was only covered by unit tests.
- **A physical phone** has not been used to check the live site by the owner. Layout
  was checked in a mobile emulation at 320, 375, 768 and 1280 pixels, with no
  horizontal scrolling at any of them.
