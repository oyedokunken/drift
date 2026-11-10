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
- the time is inside the provisional service window for its London day type (see
  below), which is narrower than the published first and last trains on purpose,
- at least 4 other lines have 3 or more trains due within 15 minutes,
- the network wide quiet guard is not tripped, and
- fewer than 2 lines have an empty feed at once. The worker fetches lines in groups,
  so one empty response would empty several lines together, and two empty lines is
  treated as a feed fault.

Service windows, read in Europe/London so daylight saving needs no handling:

| Day type | Window         | Why                                                             |
| -------- | -------------- | --------------------------------------------------------------- |
| Weekday  | 07:00 to 22:00 | Last departures run to about 00:13 to 00:56, so there is margin |
| Saturday | 08:00 to 21:30 | Starts later than a weekday, ends a little early                |
| Sunday   | 09:00 to 19:30 | The timetable probe showed Sunday last trains at 20:30 to 21:00 |

All three are **provisional**. The timetable probe (2026-11-09) was unreliable and no
Sunday evening live check has run yet, so the Sunday window opens late and closes
early on purpose. Outside the window the rule is `unknown`, never `mismatch`. A wrong
window can therefore cost a missed alarm but not a false one. The windows are in
`SERVICE_WINDOWS` in `config.ts` and are tested at both edges, at midnight and on both
clock change dates.

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

## Rules by mode

The rules read a profile per mode (`MODE_PROFILES` in `config.ts`), so a mode is a new
entry and the engine is not forked. A rule that is off for a mode can never fire there.
Every profile has a test that fails if a time threshold it uses cannot be reached inside
its lookahead, the bug that once broke wide gaps.

| Mode           | Vehicle rules                        | Wide gaps | Long waits                       | No trains | All rules in the service window       |
| -------------- | ------------------------------------ | --------- | -------------------------------- | --------- | ------------------------------------- |
| Tube           | on                                   | on        | on (30%)                         | on        | no, the network quiet guard does that |
| Elizabeth line | on                                   | **off**   | on (40%)                         | on        | yes                                   |
| DLR            | **off**                              | on        | on (30%)                         | on        | yes                                   |
| Overground     | **off**, except Mildmay and Windrush | **off**   | on for Mildmay and Windrush only | on        | yes                                   |

Vehicle rules are quiet while good, one sided service, flowing while suspended and
closed hours. They count distinct vehicles.

- **Elizabeth line.** Wide gaps is off. The first look at its feed, on the Sunday
  morning of 2026-11-08, gave a median gap of 12.7 minutes with a 30 minute spread, close
  to the 15 minute bar. On 2026-11-10 at 19:30 the median was 5.9 with a 90th percentile
  of 12.6 and 7 of 94 platforms at 15 minutes or more. Branches run at different
  frequencies, so a median over the whole line is not a safe alarm. Long waits stays on
  at 40 percent rather than 30, because 3 of 94 platforms waited 20 minutes on a healthy
  evening and a two trains an hour branch can wait that long legitimately.
- **DLR.** `vehicleId` is blank, so trains are not counted and the vehicle rules are off.
  Each prediction at a platform is a train. Median wait 3.2 minutes, median gap 5.0,
  90th percentile gap 11.0, 1 of 98 platforms waiting 20 minutes: well inside the Tube's
  thresholds, which are kept. A Suspended or Closed status resolves to unknown
  (`not-measurable`) because it cannot be checked without counting trains.
- **Overground.** Six lines, judged separately. Weaver sat at a median gap of exactly
  15.0 minutes and Lioness at 13.0 on Good Service, so wide gaps is off for the whole
  mode, as it would raise a false alarm on a healthy line. Liberty (3 platforms),
  Lioness, Suffragette and Weaver run a train every 15 to 30 minutes, so none can be
  judged by counting trains or waits in one snapshot. They keep only no trains, and
  otherwise resolve to **unknown, low confidence** with the rule `not-measurable`.
  Mildmay (58 vehicles) and Windrush (87) are frequent, so they keep the vehicle rules
  and long waits.

Outside the service window the Elizabeth line, DLR, Overground and buses resolve to
unknown, whatever the rule. The Tube is unchanged: it relies on the network wide quiet
guard, which was proven on Tube data.

The rule id `not-measurable` means Drift has no trustworthy way to judge the line or
status, so it makes no comparison. It is always unknown with low confidence.

## Bus routes

Buses are checked one route at a time when a visitor searches, never polled. The verdict
comes from `evaluateBus`, which reads the route's status, one reading of its predictions,
and when the route last had buses, and uses the same per stop measures as the Tube. A
route is judged only if it has 15 stops with a bus due. Everything doubtful is
**unknown, low confidence**.

TfL's bus status is thin: Good Service or Special Service was all that was seen, and
Special Service is a partial status, so it resolves to unknown like any other.

Two rules can fire.

**No buses (`no-buses`).** Official: Good Service. Observed: no bus predicted on the
route. It fires, with medium confidence, only when **all** of these hold:

- the time is inside the weekday, Saturday or Sunday service window,
- the route is not a night route (`N` then a digit),
- the rest of the feed is healthy: at least 4 other lines running, the network not quiet
  and fewer than 2 lines empty,
- the route had buses predicted within the last 90 minutes. A route that has not been
  seen running cannot be told from one that is not running today, and the first search of
  a route has no earlier reading, so it resolves to unknown.

**Long waits (`long-waits`)**, as for the Tube but per stop. Fires when at least 40
percent of the route's stops wait 20 minutes or more, with at least 15 stops sampled and
only on a frequent route, one whose median gap between buses is 12 minutes or less. On a
route with a bus every 20 minutes a 20 minute wait is normal, so such routes are
unknown. Confidence is low under 30 stops, high from 60 percent of stops, else medium.
The 40 percent is twice the worst healthy near miss: 7.7 percent on route 18 and 19
percent on W11, a short route.

Night routes, thin samples (fewer than 15 stops), infrequent routes, statuses other than
running, and anything outside the service window are unknown. Wide gaps is off for
buses because routes bunch, and buses are not counted, so no vehicle rule applies.

## Where the numbers live

All thresholds are named constants in `packages/engine/src/config.ts`, each
commented with its origin. Boundary tests sit on both sides of every one.
