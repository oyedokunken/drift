# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] (not yet released)

### What changed in this release

- The Elizabeth line, DLR and Overground (six named lines) are checked, with a mode
  profile and a rule set per mode, and a mode switch in the page.
- Bus routes are checked on demand when someone searches, at `GET /api/bus/:route` and
  `?bus=207`, behind a cache, request coalescing and a request budget.
- The no trains rule has a provisional service window per day type, with Sunday narrowed.
- Per platform waits and the long waits and no trains rules, from the earlier review, are
  part of this release (listed below).

### Added in the modes and buses work

- `ModeProfile` in the engine config: lookahead, thresholds, vehicle id handling, enabled
  rules and service window per mode, with a reachability test for every profile.
- Lines `elizabeth`, `dlr`, `liberty`, `lioness`, `mildmay`, `suffragette`, `weaver` and
  `windrush`, a `mode` on every verdict, and the rule ids `not-measurable` and `no-buses`.
- `evaluateBus` and `GET /api/bus/:route` with typed 400, 404, 429 and 503 answers.
- A bus route list (ids and names, daily), a 45 second per route cache, a 200 route LRU
  cap and a budget of 120 TfL requests a minute.
- A mode switch, a bus search with a state for every outcome, and a non Tube mismatch in
  `?sample=1`.
- Fixtures for the Elizabeth line, DLR and Overground, and findings in `docs/API-NOTES.md`.

### Changed in the modes and buses work

- `vehicles15`, `vehicles30`, `inbound15` and `outbound15` can be null, for the DLR, where
  `vehicleId` is blank and trains are not counted.
- The service window is per day type: weekday 07:00 to 22:00, Saturday 08:00 to 21:30,
  Sunday 09:00 to 19:30, London time, all provisional. The old single 07:00 to 22:00
  window is gone.
- The cron tick alternates between the Tube groups and the groups for the other modes.
- Tests that had to change, and why: one shared test used `dlr` as an unknown line, five
  worker tests used it the same way or assumed Tube only status, one refresh test counted
  five groups, and two engine tests moved from a Sunday to a Monday 07:00 start because a
  Sunday now opens at 09:00. The Tube verdict tests are unchanged.

### Not done

- Bus bunching detection. Cut for time, and a stop with a bus every few minutes can look
  bunched while healthy.
- Bus route suggestions and autocomplete. Exact route entry only.
- A real disruption has never been seen firing any of the new rules.
- CPU for the new modes and for bus checks was not measured on Cloudflare.
- The weekend live checks fall after the 2026-11-13 handover, so the Sunday window is
  unproven.

### From the earlier review (per platform waits)

### Fixed

- Wide gaps can now fire on live data. It needed 3 trains per platform inside a 30
  minute lookahead, which capped every gap at 15 minutes, the threshold itself. The
  engine now measures the next train wait and the gap after it per platform, takes a
  missing train as a lower bound, and a test fails if a time threshold exceeds the
  lookahead.
- A line losing part of its service can no longer hide in the whole line train count:
  the new long waits rule flags a line when 30 percent or more of its platforms wait 20
  minutes or longer.
- A Good Service line with no trains at all is now a mismatch (no trains) instead of
  unknown, only when its feed is fresh and empty, it is inside the service window, the
  rest of the network is running and fewer than 2 lines are empty at once. Overnight,
  closed, planned and feed fault cases stay unknown.

### Changed

- `ArrivalSummary` and the verdict `observed` block gain `longWaitPlatforms`;
  `platformsMeasured` now counts platforms with at least one train, and `headwaySec` is
  the median first to second train gap per platform. Summaries stored before this change
  fail the schema and are skipped until the next refresh.

### Added

- Rule ids `long-waits` and `no-trains`, with titles, a figure and a track in the web app.
- End to end tests from raw predictions to a verdict for every rule, including overnight,
  Service Closed, stale, whole feed empty and two lines empty at once.

### Not done

- The time of day baseline. Thresholds are still fixed numbers from one Sunday and one
  weekday snapshot, and a platform that loses every train disappears from the feed and
  is not seen. See "Not covered" in `docs/RULES.md`.

## [0.1.0] - 2026-11-08

First release.

### Added

- Mismatch engine (`packages/engine`): a pure, deterministic `evaluate` and
  `summarise`, with three rules (quiet while good, flowing while suspended, wide
  gaps), guards for stale, empty and partial data, and a network wide quiet check.
- Shared Zod schemas (`packages/shared`) for predictions, statuses, summaries,
  verdicts, snapshots and typed API errors.
- Worker (`apps/worker`): `/api/snapshot` and `/api/health`, upstream client with
  timeouts, retries, backoff with jitter and `Retry-After`, request coalescing, a 45
  second cache, a last known good fallback and a typed 503, security headers and
  structured logs that redact the TfL key.
- A SQLite backed Durable Object that refreshes line summaries every minute from a
  cron trigger, fetching five groups of lines in parallel.
- Web app (`apps/web`): live summary, mismatch cards, compact line list with a drift
  track, and designed loading, in step, partial, stale, offline and error states.
  Urbanist self hosted, restrained motion that respects reduced motion, and ages
  measured on the server's clock.
- Brand assets generated from SVG sources: logo, favicon set, web manifest and a
  social image.
- CI on every push: typecheck, lint, format check, tests with coverage thresholds,
  build and a gitleaks secret scan.
- Documentation: architecture, mismatch rules, API notes, verification record,
  prompt log, security policy and contributing guide.

### Changed

- Interface redesign: a full-bleed deep blue masthead, a light blue page wash, filled
  line chips and verdict pills, large train counts, deep blue mismatch cards and a deep
  blue footer.
- The drift track draws one measured value against the engine's own threshold from
  `config.ts`, with the threshold marked, and is omitted where no honest comparison
  exists.

### Fixed

- Cold start: when the store holds no line summaries, the first request runs one
  refresh, shared between concurrent requests and capped at 7 seconds, instead of
  showing every line as "no live data" until the next cron tick. A live outage seen
  shortly after a deploy was not diagnosed to a proven cause, and this is the likeliest
  explanation, not a confirmed one.
- Footer links open in a new tab with `noopener`.

### Added (since the first draft)

- Sample mode at `?sample=1`, with a persistent "Sample data, not live" banner.
- Footer icons and a developer credit linking to oyedokun.dev.

### Known limits

See "Not finished" in the README. The Tube only, no dark theme, thresholds
calibrated on one day, and no real mismatch observed during testing.
