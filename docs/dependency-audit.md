# Dependency audit

CI runs `pnpm audit --prod --audit-level high` (`.github/workflows/dependency-audit.yml`) on every pull
request, on pushes to `main` and `dev`, and weekly. It fails on any high or critical advisory in the
production dependency tree.

## Fixing a finding

Bump the dependency to the lowest patched version in its current major. For a transitive dependency
add a `pnpm.overrides` entry in `package.json`, for example:

```json
"minimatch@>=3.0.0 <4.0.0": "^3.1.4"
```

Do not force a major bump through an override without checking the dependent still works.

## Exceptions

An advisory can be ignored only if it cannot be fixed without a breaking major bump and is not
reachable from our code. List its GHSA id in `package.json` under `pnpm.auditConfig.ignoreGhsas` and
add a row here with the reason and what unblocks the real fix.

| Advisory | Package | Path | Why it is accepted | Unblocked by |
| --- | --- | --- | --- | --- |
| GHSA-5c6j-r48x-rmvq | serialize-javascript 6.0.2 | `@sentry/nextjs > @sentry/webpack-plugin > webpack > terser-webpack-plugin` | Build-time only (webpack minifier), never shipped or run in production. Fix needs serialize-javascript 7. | `terser-webpack-plugin` moving to serialize-javascript 7, or a webpack upgrade |
| GHSA-mrhx-c7xc-m3w5 | zod 3.22.4 | `porto > ox > abitype > zod` | Memory exhaustion needs zod to validate an attacker-controlled oversized collection. abitype only validates ABI definitions we ship. Fix needs zod 4. | `abitype`/`ox`/`porto` moving to zod 4 |
