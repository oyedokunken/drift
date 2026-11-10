# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
  unknown, only when its feed is fresh and empty, it is 07:00 to 22:00 London time, the
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
