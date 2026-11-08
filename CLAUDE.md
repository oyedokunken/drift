# CLAUDE.md

Rules for any AI agent working in this repository.

## What Drift is

Drift is a live web tool that shows when Transport for London's official line
status does not match what the live arrivals data shows. It is a hiring test
for a prospective client, who judges the quality of what ships, not the amount.
Code will be read line by line. Prefer clarity, correctness and visible care
over feature count. Cut scope early and record the cut in the README.

Before touching the engine, read `docs/RULES.md`.

## Commands

```
pnpm install --frozen-lockfile   # install
pnpm dev                         # web (Vite) and worker (wrangler dev)
pnpm test                        # vitest, all packages
pnpm test:coverage               # vitest with enforced thresholds
pnpm lint                        # eslint
pnpm format:check                # prettier check
pnpm typecheck                   # tsc --noEmit in every package
pnpm build                       # build web, then worker
pnpm deploy                      # wrangler deploy (manual, needs login)
pnpm brand                       # regenerate logo, favicons and the social image
```

Run typecheck, lint and tests before every commit. Never claim something works
without having run it.

## Repo map

```
apps/web          Vite, React, TypeScript, Framer Motion. The interface.
apps/worker       Cloudflare Worker and Durable Object. Serves /api/*, the built
                  web app, and a cron refresh of the line summaries.
packages/engine   Pure TypeScript mismatch engine. No I/O, no global clock.
packages/shared   Zod schemas and types shared by worker and web.
docs/             Architecture, rules, API notes, prompts, verification.
brand/            SVG sources for the logo, mark and social image.
scripts/          Brand asset generation (SVG to PNG and ICO).
.github/          CI workflow and templates.
```

## Hard rules

1. No secrets anywhere: code, config, docs, tests, fixtures, logs or history.
   The TfL key lives only in a Cloudflare secret and a gitignored
   `apps/worker/.dev.vars`. Commit only `.dev.vars.example` with an empty value.
2. Redact `app_key` in every log line, error message and URL.
3. No emojis. No em dashes and no en dashes, anywhere. Use commas, colons,
   full stops or the word "to".
4. No native HTML form validation. No `required`, `pattern`, `min`, `max` or
   type-based validation. Set `noValidate` on forms. Validate with Zod. Prefer
   UI that takes no input.
5. Zod validates every boundary: TfL responses in the worker, the snapshot in
   the browser, and any user input.
6. Framer Motion only for animation, via `LazyMotion` with `m` components. The
   features are `domMax`, loaded lazily after first paint, because the layout
   animation that reorders lines exists only in `domMax`. See "Deviations from the
   plan" in the README. Wrap the app in `MotionConfig reducedMotion="user"`.
7. Font is Urbanist, self-hosted with `@fontsource-variable/urbanist`, latin
   subset, preloaded. No third party font request.
8. Real history: small Conventional Commits. No squashing, no force pushes, no
   rewriting history.
9. If something needs Kenny (the key, wrangler login, real hours), stop and
   ask. Never ask for a secret in chat. Never invent values.

## Code conventions

- TypeScript strict, with `noUncheckedIndexedAccess`. No `any`. No non-null
  assertion without a comment that justifies it.
- No dead code, no commented-out code, no TODO left behind.
- The engine is pure: `evaluate(statuses, arrivals, now)`. Inject `now`. No
  network, no `Date.now()`, no randomness.
- All thresholds are named constants in one config module, each commented with
  where the number came from.
- Small functions with one job. Named exports only, no default exports (except
  where a tool requires one).
- Errors: parse at the boundary, return typed results for expected failures,
  throw only for programmer errors. A false alarm is worse than a missed one,
  so missing or bad data resolves to "unknown".
- Names: `camelCase` values, `PascalCase` types and components, `kebab-case`
  files, `SCREAMING_SNAKE_CASE` constants.

## Design

- Calm, precise, editorial. No component kit look, no shadow-heavy cards.
- Tokens live in one CSS file as custom properties. Blues: `#0B2A6F`,
  `#2563EB`, `#BFD7FF`. Neutrals: white, `#0A0B0F`, `#F5F6F8`, `#E3E6EB`,
  `#6B7280`, `#374151`. Keep WCAG AA and verify it.
- Surfaces use the same palette: deep blue masthead, cards and footer, a page wash
  that is a tint of `#BFD7FF` on white (`--wash`, `--panel-soft`). Every text pair,
  including translucent layers at their lightest, is checked in `tokens.test.ts`.
- The drift track shows an observed value against an engine threshold from
  `config.ts`. Never draw a track that is not a measurement.
- `?sample=1` shows engine built fixture mismatches with a persistent banner. It must
  never turn on without that exact query parameter.
- Do not use TfL line colours, roundel, logo or the phrase "Mind the Gap".
- Meaning is carried by shape, weight and text as well as colour.
- Design at 375px first. Touch targets at least 44px. No horizontal scroll at
  320px. Visible focus. `aria-live="polite"` for refresh results.
- Motion is restrained and never bouncy.

## Testing and definition of done

- Vitest everywhere. Engine tests are table-driven, use sanitised real
  fixtures plus hand-built edge cases, and hold 90 percent coverage or more.
- Worker tests mock fetch and cover success, schema failure, timeout, 429 with
  Retry-After, 5xx then recovery, outage with and without last good snapshot,
  cache hit, coalescing, and proof the key never leaks.
- Web tests cover loading, in step, mismatches, stale, offline and error, with
  an automated accessibility check.
- Done means: typecheck, lint, format and tests pass; docs updated; no secrets,
  dashes or emojis introduced; the change is committed on its own.

## Git workflow

Conventional Commits: `feat`, `fix`, `test`, `docs`, `chore`, `ci`,
`refactor`. One logical change per commit. Commit messages are public, so keep
private details out. Do not make the repository public. Kenny does that.

## Never do

- Never commit a secret, a `.dev.vars` file or a key in a fixture.
- Never use dashes (em or en) or emojis.
- Never add native form validation.
- Never log or return the TfL key, in whole or in part.
- Never add a dependency without a one-line justification in the commit.
- Never raise a mismatch from missing, empty or malformed data.
