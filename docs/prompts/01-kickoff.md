# 01 Kickoff

## Intent

Give the agent the whole brief, the working rules and the stage order in one go, so
that every later decision could be checked against it.

## Prompt (condensed)

The original was a long single message. These are its parts, with personal details
and contact information removed.

**Role.** A senior engineer pairing with the project owner. The build is a hiring
test, and the client judges the quality of what ships, not the amount. Work in small
verified steps, prefer the simpler option and write down why.

**The test.** Build a live web tool that shows when TfL's official line status does
not match what is really running, using TfL's open API with the owner's own free key.
Stack: TypeScript and React on the Cloudflare free tier. The client judges: right on
live data, survives outages and repeated calls, tests on every push, no keys in the
repo, fast and clean on a phone.

**Hard rules.** No secrets anywhere, ever. No emojis, no em dashes and no en dashes.
No native form validation. Zod at every boundary. Framer Motion for animation, with
reduced motion respected. Urbanist, self-hosted. Strict TypeScript. Small
Conventional Commits and a real history. Never claim something works without running
it. Stop and ask when something needs the owner, and never ask for a secret in chat.

**Design.** Calm, precise, editorial. Three blues plus white, black and grey. Not
TfL's colours, roundel or logo. State meaning with shape, weight and text as well as
colour. Mobile first. Accessible. Fast.

**Architecture.** A pnpm monorepo with a web app, a Worker, a pure engine package and
a shared schema package. One Worker serving the API and the static app. Timeouts,
retries with backoff, request coalescing, a short cache and a last known good
fallback. Security headers on every response.

**The engine.** Pure and deterministic, with the clock injected. Inspect the real
data first and design the thresholds from what it shows. A false alarm is worse than
a missed one, so missing or partial data resolves to "unknown".

**Workflow.** Stage 0 setup, stage 1 discovery against the real API, stage 2 a plan
for the client (then stop), then foundation, engine, Worker, web, deploy and
verification, and packaging.

## What it produced

`CLAUDE.md`, the licence, gitignore and Node pin as separate commits, then the whole
project in stage order. Stage 1 found that TfL's arrivals feed is far too heavy for
the free tier's CPU limit, which shaped the architecture (see the next entries).
