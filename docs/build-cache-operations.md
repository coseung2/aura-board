# Oracle build cache

The main-branch Oracle workflow keeps disposable compiler caches under
`${runner.tool_cache}/aura-board-build-cache-v1`, outside the checkout and
`RUNNER_TEMP`. Checkout cleanup remains enabled. No runtime env, user data,
standalone release directory or signed release artifact is cached.

- Next key: Node version, package lock, Next config and TypeScript config.
- Rust key: compiler/host version, Cargo lock and current compilation flags.
- Cargo still runs tests and the release build each time; its fingerprints decide
  what can be reused. The artifact installer uses the selected target directory.
- An exclusive `flock` protects the cache during build; existing deployment
  workflow concurrency also remains unchanged.
- `npm ci` still runs lifecycle scripts and generates Prisma via `postinstall`.
  Native dependency checking and `prisma validate` remain explicit. Next's own
  production typecheck remains enabled; separate duplicate TypeScript and Prisma
  invocations were removed only from the CI artifact script.

## Rollout and fallback

`AURA_NEXT_BUILD_CACHE=1` enables the installed Next version's experimental
Turbopack production filesystem cache. Remove this flag to disable that feature
without changing runtime behavior or local development defaults. Remove
`AURA_BUILD_CACHE_ROOT` as well for a fully cold build with the normal local
Cargo target directory. Do not disable typechecking as a fallback.

First use of a new cache key is cold. Compare two successful builds with unchanged
lockfiles before claiming a speed improvement. Inspect `build_timing_*_seconds`
for install, native checks, schema, web and engine durations and cache messages.
Verify release SHA, both runtime services and public health after rollout.

Old keys are retained, not automatically deleted. Monitor disk usage; prune only
explicit old cache-key directories while no build holds the lock. Do not delete
the runner tool cache root, checkout, active key or live release directories.

## Local verification

Run `python -m unittest infra.oracle.tests.test_build_cache
infra.oracle.tests.test_create_cutover_build_manifest -v` (on one command line).
Tests cover cache reuse across fresh checkout output, lockfile invalidation,
rejection of checkout-local caches, verification gates and fatal build failure.
Windows Git Bash tests stub `flock`; real Linux lock behavior and actual warm
compiler performance require the first Oracle CI runs. No production build or
deployment is triggered by the unit tests.
