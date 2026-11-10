# Mismatch rules

Drift compares what TfL officially says about a line (its status) with what the
live predictions show. This page is the contract for the engine in
`packages/engine`. Read it before changing the engine.

**Guiding principle: a false alarm is worse than a missed one.** Whenever the
evidence is thin, missing or ambiguous, the verdict is `unknown`, never
`mismatch`.

**Calibration status: provisional.** Every threshold below comes from real
data, but so far only from a Sunday morning (2026-11-08, about 09:00 London
time). Overnight, weekday peak and evening samples are being collected and the
numbers will be revisited against them. `docs/VERIFICATION.md` records the
checks made against TfL's own pages.

Scope: the 11 Tube lines. The Elizabeth line is added only if it fits the CPU
budget (see `docs/ARCHITECTURE.md`). DLR is out: its predictions have no
vehicle id, so trains cannot be counted.

## Inputs

- **Statuses**: one entry per line from the Line Status endpoint. A line can
  carry several statuses at once.
- **Arrival summaries**: one small summary per line, reduced from the raw
  predictions by `summarise()` in the engine. Fields: `fetchedAt`,
  `vehicles15` (distinct vehicles due within 15 minutes), `vehicles30`,
  `inbound15` and `outbound15` (the same, split by direction where the feed
  gives one), `headwaySec` (typical gap between trains, see rule 3),
  `platformsMeasured` (platforms with at least one train due) and
  `longWaitPlatforms` (of those, how many wait 20 minutes or more, see rule 4).
- **now**: injected, never read from a clock inside the engine.

Why vehicles are counted distinctly: one train appears once per upcoming
station in the feed, so raw prediction counts say little.

## Output

One verdict per line: `lineId`, `official` (severity and label), `observed`
(the metrics used), `outcome` (`match`, `mismatch`, `unknown`), `ruleId`, a
plain language `reason`, and `confidence` (`high`, `medium`, `low`).

## Step 1: guards, applied before any rule

1. **No usable arrivals** (missing, failed, malformed, empty, or older than 240 s
   at `now`): `unknown`, rule `no-arrivals`, confidence low. An empty feed, or
   one where no prediction can be tied to a train, cannot on its own tell a quiet
   line from a broken feed, so it is treated as missing. The one exception is rule
   5, which lets a fresh, empty feed through under strict conditions.
2. **Network wide quiet**: if at least 5 lines have fresh summaries and 70
   percent or more of them show fewer than 3 vehicles within 15 minutes, the
   cause is service hours or a feed fault, not any one line. Rules 1 and 3 then
   return `unknown`, rule `network-quiet`. This replaces a clock based
   "overnight" check, which would be wrong at the edges and on holidays.
3. **Classify the official status** (all of a line's statuses are considered):
   - _Partial or planned_: Part Suspended, Planned Closure, Part Closure,
     Reduced Service, Special Service, Part Closed, Diverted, Change of
     frequency, Bus Service, Exit Only, Information, Issues Reported, No Step
     Free Access. If **any** status is of this kind the verdict is `unknown`,
     rule `partial-status`. Network wide traffic cannot confirm or contradict a
     partial status, so Drift does not try.
   - _Whole line down_: Suspended, Closed, Not Running (when no partial status
     is present).
   - _Severe Delays_: not contradicted by traffic (delayed trains still run),
     so `unknown`, rule `delays-unverifiable`. This is a deliberate cut.
   - _Closed for the night_: Service Closed. With 2 or fewer vehicles within 15
     minutes the verdict is `match`, rule `closed-hours`. With more it is
     `unknown`: trains near the start or end of service are not worth an alarm.
   - _Running_: Good Service, Minor Delays, No Issues. Rules 1 and 3 apply.

## Rule 1: quiet while good (`quiet-while-good`)

Official: Good Service. Observed: too few trains.

Fires `mismatch` when **either**:

- fewer than 3 distinct vehicles are due within 15 minutes (1 for Waterloo and
  City, a two train line), or
- at least 8 vehicles with a known direction are due but one direction has none
  (only vehicles with a direction count here, since 10 to 30 percent of
  predictions lack one).

Confidence: high when no vehicle is due within 15 minutes (the feed still holds
trains, but none are close), otherwise medium.

Why 3: healthy Tube lines showed 10 to 68 vehicles within 15 minutes on Sunday
morning (Circle lowest at 10). 3 is far below any healthy reading yet above
zero, so a thin but running line is not flagged.

Example: Central is Good Service but only 1 vehicle is due in 15 minutes while
the other lines look normal. Verdict: mismatch, "Official status is Good
Service but only 1 train is due in the next 15 minutes."

## Rule 2: flowing while suspended (`flowing-while-suspended`)

Official: Suspended, Closed or Not Running for the whole line. Observed:
healthy flow.

Fires `mismatch` when at least 6 distinct vehicles are due within 15 minutes.
Confidence: high from 12 vehicles, otherwise medium. With fewer than 6 the
verdict is `match`: a suspended line with no trains agrees with its status.

Why 6: roughly half the quietest healthy line (Circle, 10), so ordinary
leftover predictions on a suspended line do not trip it.

Caveat: no suspended Tube line has been seen yet during sampling. This rule is
tested against hand built cases, and its threshold is the least proven of the
set. The README says so.

Example: Victoria is Suspended but 14 vehicles are due. Verdict: mismatch,
high confidence.

## Rule 3: wide gaps while good (`wide-gaps`)

Official: Good Service or Minor Delays. Observed: trains far apart.

The unit of measurement is the **platform**. For each station and platform, the
engine takes the distinct trains due inside the 30 minute lookahead and measures

- the **wait**: seconds until the next train, and
- the **gap**: seconds from the next train to the one after it.

A train missing from the window is a lower bound, not a reason to skip. If only
one train is due, the next one is at least a horizon away, so the gap is taken as
30 minutes minus the wait. A platform with no train at all does not appear in the
feed, so it cannot be measured here (see "Not covered" below).

The typical headway is the median gap over platforms. Fires `mismatch` when it
is 15 minutes or more and at least 5 platforms were measured. Confidence: low if
fewer than 10 platforms were measured (this wins over the next one), otherwise
high from 25 minutes, otherwise medium.

This used to need 3 trains per platform inside the 30 minute window, which capped
every gap at 15 minutes, exactly the threshold, so the rule could never fire on
live data. Two trains now give a gap of up to 30 minutes. `config.test.ts` fails
if any time threshold exceeds the lookahead, and `end-to-end.test.ts` drives the
rule from raw predictions.

Why the median and not the largest gap: a platform with one train due looks like a
long gap, and up to 12 percent of platforms on healthy lines had a gap of 25
minutes or more by this measure (Bakerloo 4 of 33, Victoria 2 of 31). The median over
platforms ignores them. On
2026-11-08 the median gap was 3 minutes on Victoria, 4 on Bakerloo and 10 on
Circle. 15 leaves a 1.5 times margin over the slowest.

Example: Piccadilly is Good Service but the typical headway across its
platforms is 18 minutes. Verdict: mismatch, medium confidence.

## Rule 4: long waits while good (`long-waits`)

Official: Good Service or Minor Delays. Observed: many platforms with no train
due for a long time.

Counts the platforms whose **wait** (next train) is 20 minutes or more, as a share
of the platforms measured. Fires `mismatch` when that share is 30 percent or more
and at least 5 platforms were measured. Confidence: low if fewer than 10 platforms
were measured, otherwise high from 50 percent, otherwise medium. Checked after
rule 3, which wins when both apply.

This is what catches a line that loses part of its service while the whole line
count stays high: a line total adds up trains over every platform, so one half
running normally hides the other half stranded.

Why 20 minutes and 30 percent: on 2026-11-08 no platform on the four sampled lines
waited 20 minutes (the longest was 18, on Circle), and 14 percent of Circle's
waited 15. 30 percent is about twice the worst near miss.

Example: Central is Good Service but 20 of its 40 measured platforms have no train
due for 20 minutes. Verdict: mismatch, high confidence.

## Rule 5: no trains while good (`no-trains`)

Official: Good Service (every status). Observed: a fresh feed with no predictions
for the line at all.

Fires `mismatch` only when **all** of these hold, because a silent feed is also
what an outage or a service gap looks like:

- the line's summary is fresh and its feed held zero predictions (not merely none
  tied to a train),
- the time is inside service hours, 07:00 to 22:00 London time (narrower than the
  published first and last trains on purpose),
- at least 4 other lines have 3 or more trains due within 15 minutes,
- the network wide quiet guard is not tripped, and
- fewer than 2 lines have an empty feed at once. The worker fetches lines in groups,
  so one empty response would empty several lines together, and two empty lines is
  treated as a feed fault.

Confidence is always medium: one snapshot cannot rule out a short feed gap.
Anything else stays `unknown` with rule `no-arrivals`. Overnight, Service Closed,
planned closures, partial statuses, suspended lines and feed faults therefore
never raise this alarm.

Example: Central is Good Service at 09:00 but its feed is empty while five other
lines run. Verdict: mismatch, medium confidence.

## Not covered: the time of day baseline

Rules 3 to 5 compare against fixed thresholds that were chosen from one Sunday
morning. They do not yet compare a platform with what is normal for that platform
at that time of day. So:

- a 12 minute wait is the same at 08:00 on a weekday as at 21:00 on a Sunday;
- a platform that has lost every train disappears from the feed and cannot be seen,
  so a line losing whole platforms is only caught when enough others show long waits
  or the line goes entirely silent.

A baseline per platform and time bucket is the next piece of work and is not built.

## Verdict when no rule fires

`match`, with confidence high unless a metric sits within 25 percent of its
threshold, or fewer than 5 platforms were measured, then medium.

## Where the numbers live

All thresholds are named constants in `packages/engine/src/config.ts`, each
commented with its origin. Boundary tests sit on both sides of every one.
