# Dependency audit

CI runs `pnpm audit --prod --audit-level high` (`.github/workflows/dependency-audit.yml`) on every pull
request, on pushes to `main` and `dev`, and weekly. It fails on any high or critical advisory in the
production dependency tree.

## Fixing a finding

Bump the dependency to the lowest patched version in its current major, and skip a version the
registry marks as deprecated (lodash 4.18.0 is a "Bad release", 4.18.1 is the fix to use). A package we
declare ourselves is bumped in `package.json`. For a transitive dependency add a `pnpm.overrides`
entry pinned to that version and limited to the vulnerable major, for example:

```json
"minimatch@>=3.0.0 <4.0.0": "3.1.5"
```

Do not force a breaking bump through an override without checking the dependent still works. In a 0.x
package a minor is a breaking change, so `^0.2.2` does not allow 0.3. That is why `decode-uri-component`
is an exception below and not an override: 0.3 and later are ESM-only and `query-string` 7 loads it
with `require`.

## Exceptions

An advisory can be ignored only if it cannot be fixed without a breaking bump and we have checked it is
not reachable in a way that matters. Its GHSA id goes in `package.json` under
`pnpm.auditConfig.ignoreGhsas`. The ignore is by advisory id, so it hides that advisory on every path:
list every production path here, not only the one the audit prints first.

| Advisory | Package | Paths | Why it is accepted | Unblocked by |
| --- | --- | --- | --- | --- |
| GHSA-5c6j-r48x-rmvq | serialize-javascript 6.0.2 | `@sentry/nextjs > @sentry/webpack-plugin > webpack > terser-webpack-plugin` | Build time only (webpack minifier), never shipped or run in production. The fix needs serialize-javascript 7 (>= 7.0.3). | `terser-webpack-plugin` moving to serialize-javascript >= 7.0.3, or a webpack upgrade |
| GHSA-qr28-fpjm-wq7f | decode-uri-component 0.2.2 | `wagmi > @wagmi/connectors > @walletconnect/ethereum-provider > @reown/appkit > @walletconnect/universal-provider > @walletconnect/utils > query-string > decode-uri-component` | A crafted string with long runs of percent-encoded characters makes the decoder slow (quadratic), so the worst case is a hung tab for the user who received it. There is no 0.2.x patch. The fixed 0.5.1 is ESM-only and `query-string` 7 is CommonJS, so forcing it with an override could break query parsing in the wallet modal. | `@walletconnect/utils` moving to a `query-string` that uses the ESM decoder |
| GHSA-mrhx-c7xc-m3w5 | zod 3.22.4 | `@reown/appkit-wallet` (WalletConnect and RainbowKit modal, through `wagmi > @wagmi/connectors > @walletconnect/ethereum-provider > @reown/appkit`), and `abitype` (through `viem`, `ox`, `porto` and the core SDK) | The advisory is memory exhaustion when zod validates an oversized collection. Every path runs in the visitor's browser, and this repo has no server-side zod validation (nothing under `src` imports zod, the API routes do not use it), so the worst case is a hung tab for the user who received the input. `abitype` only uses zod behind its optional `abitype/zod` entry. The fix is zod >= 4.6.6, a major bump of a library each of these packages pins. | `@reown/appkit-wallet` and `abitype` resolving to zod >= 4.6.6 |
