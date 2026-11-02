# Agent instructions

## Run the dependency audit before you commit

CI has a `Dependency audit` workflow that fails the pull request on a high or critical advisory in the
production dependency tree. Run the same check locally before every commit that touches
`package.json` or `pnpm-lock.yaml`, so CI does not block you:

```bash
pnpm audit --prod --audit-level high
```

If it fails:

1. Fix it the way `docs/dependency-audit.md` describes: bump to the lowest patched version in the
   current major, a `pnpm.overrides` entry for a transitive package.
2. Do not add an exception to `pnpm.auditConfig.ignoreGhsas` without a written reason in
   `docs/dependency-audit.md`.
3. Do not force a breaking bump through an override without checking the dependent still works. In a
   0.x package a minor is breaking, and a newer release can be ESM-only for a CommonJS consumer.

Run it again after you add or bump any dependency.
