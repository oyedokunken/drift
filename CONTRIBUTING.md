# Contributing

## Setup

Requires Node 22 (see `.nvmrc`) and pnpm.

```
pnpm install
cp apps/worker/.dev.vars.example apps/worker/.dev.vars
```

Put your own free TfL application key in `.dev.vars`. Never commit it.

## Workflow

1. Branch from `main`.
2. Make one logical change at a time, with tests.
3. Run `pnpm typecheck`, `pnpm lint`, `pnpm format:check` and `pnpm test`.
4. Open a pull request using the template.

## Commits

Conventional Commits: `feat`, `fix`, `test`, `docs`, `chore`, `ci`,
`refactor`. Keep commits small and meaningful. Do not squash or rewrite
published history.

## Code style

Strict TypeScript, no `any`, Zod at every boundary, named exports, small
functions. No emojis, and no em or en dashes anywhere. See `CLAUDE.md` for the
full rules.

## Tests

Every change needs tests. Engine changes need table-driven cases on both sides
of any threshold touched.

## Proposing a rule change

Open an issue with: the rule, the live data that motivates it (a captured,
sanitised fixture), the threshold, and what false alarm risk it adds. Read
`docs/RULES.md` first. A false alarm is worse than a missed one.

## Pull request checklist

- [ ] Typecheck, lint, format and tests pass
- [ ] New behaviour is tested
- [ ] Docs updated if behaviour or rules changed
- [ ] No secrets, dashes (em or en) or emojis
