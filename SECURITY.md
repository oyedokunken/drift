# Security policy

## Supported versions

Only the latest release on `main` is supported.

## Reporting a vulnerability

Please report privately, not in a public issue.

- Use GitHub private vulnerability reporting on this repository (Security tab,
  "Report a vulnerability"), or
- email oyedokunken@gmail.com.

Expect an acknowledgement within a few days. Please give a reasonable time to
fix before any public disclosure.

## In scope

- The Worker (`apps/worker`) and its `/api/*` routes.
- The web app (`apps/web`) and its handling of data from the Worker.
- Anything that could expose the TfL API key.

Out of scope: TfL's own services, and Cloudflare's platform.

## Secret handling

Drift has one secret, the TfL application key.

- In production it exists only as a Cloudflare Worker secret.
- Locally it lives only in `apps/worker/.dev.vars`, which is gitignored. The
  repository holds `apps/worker/.dev.vars.example` with an empty value.
- TfL accepts the key as a query string parameter, so the Worker redacts it in
  every log line and error path, and never returns it in a response.
- CI runs a secret scan (gitleaks) on every push and pull request.

If you find a key anywhere in the repository or its history, please report it.
