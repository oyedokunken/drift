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
  gives one), `headwaySec` (typical gap between trains, see rule 3) and
  `platformsMeasured`.
- **now**: injected, never read from a clock inside the engine.

Why vehicles are counted distinctly: one train appears once per upcoming
station in the feed, so raw prediction counts say little.

## Output

One verdict per line: `lineId`, `official` (severity and label), `observed`
(the metrics used), `outcome` (`match`, `mismatch`, `unknown`), `ruleId`, a
plain language `reason`, and `confidence` (`high`, `medium`, `low`).

## Step 1: guards, applied before any rule

1. **No usable arrivals** (missing, failed, malformed, or older than 240 s at
   `now`): `unknown`, rule `no-arrivals`, confidence low.
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
- at least 8 vehicles are due but one direction has none (only checked when the
  feed supplies directions, since 10 to 30 percent of predictions lack one).

Confidence: high when no vehicle is due within 30 minutes, otherwise medium.

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

The metric is the **typical headway**: for each platform with at least 3
predicted vehicles, take the median gap between consecutive vehicles, then take
the median of those across platforms. Fires `mismatch` when it is 15 minutes
or more and at least 5 platforms were measured. Confidence: high from 25
minutes, low if fewer than 10 platforms were measured, otherwise medium.

Why the median and not the largest gap: the single largest gap on a healthy
line reached 21 minutes (Metropolitan), which would raise false alarms. The
median of medians stayed between 2.5 and 10 minutes on every line (Circle
highest at 10). 15 leaves a 1.5 times margin over the slowest healthy line.

Example: Piccadilly is Good Service but the typical headway across its
platforms is 18 minutes. Verdict: mismatch, medium confidence.

## Verdict when no rule fires

`match`, with confidence high unless a metric sits within 25 percent of its
threshold, then medium.

## Where the numbers live

All thresholds are named constants in `packages/engine/src/config.ts`, each
commented with its origin. Boundary tests sit on both sides of every one.
