# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
