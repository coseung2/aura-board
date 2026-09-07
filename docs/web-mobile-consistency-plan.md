# Public web/mobile consistency work

## Scope and baseline

- Baseline: `64132b15` on `main`; existing uncommitted synchronization changes are reviewed, not assumed correct.
- The source of truth for public exposure is `src/lib/product-release.ts` plus server authorization. Include stable layouts (`freeform`, `columns`, `dj-queue`, `plant-roadmap`) and existing readable legacy layouts (`grid`, `event-signup`), sharing, engagement, and ordinary student/parent classroom surfaces.
- Exclude feature-specific work on administrator/development-only games, assignments, quiz, breakout, community, feed, and agent features. Shared transport/cache fixes can benefit them without changing rollout policy.
- Preserve pre-existing development-only edits without staging them. Do not change store release versions or publish mobile binaries in this task.

## Stage 1 — Cache correctness

Review server and client single-flight caches. Prove invalidation cannot resurrect an older response, strand a resolved pending promise, discard unrelated-key caching, or treat a partial liked-card set as complete. Give explicit snapshot revalidation a path past process-local settled caches while retaining request coalescing. Keep authentication and viewer-specific fields outside shared snapshots.

Commit after deterministic race tests and type checks.

## Stage 2 — Web/server mutation and recovery contract

Audit public create/update/delete, sections, sharing, engagement, and board settings. Ensure committed mutations invalidate the appropriate caches and publish only safe invalidation signals. Shared pages must reconcile on initial subscribe, reconnect, focus and connection failure; late responses must not overwrite newer state. Preserve server authorization and clear inaccessible content.

Commit after route and hook recovery tests.

## Stage 3 — Public mobile consistency

Review public board layouts and ordinary classroom screens for refresh ownership, foreground/focus recovery, missing events, refresh/mutation overlap and deleted/inaccessible content. Resolve public Realtime configuration at runtime, avoid permanent failed initialization, and centralize visible-screen recovery without multiplying subscriptions or background polling. Preserve intentional native/web differences and bounded asynchronous-job polling.

Commit after mobile transport/cache/public-layout tests, typecheck and design checks.

## Stage 4 — Regression and delivery

Update the single verification source of truth at [verification-checklist.md](verification-checklist.md), with a public-surface matrix and deterministic test coverage. Run the relevant/full test suite, web/mobile type checks, design/line/encoding checks, and production build where the environment permits. Commit verification results, push the completed scoped commits to `main`, and run Android verification only through the documented GitHub Actions Windows workflow. Report actual workflow status and distinguish source push, server rollout, mobile rebuild, and physical-device verification.

## Evidence rules

- A source audit, a mocked race test, an HTTP/DB integration test, and a real two-device test are different evidence levels; report them separately.
- Realtime is an invalidation transport, not data authority. A healthy socket alone does not prove an event was delivered or a snapshot was fresh.
- No blanket removal of polling: keep bounded job-status polling, local clocks, and explicit connection-recovery polling.

## Implementation record

1. `3ff842c2` — fixed client/server cache races, stale alias-pending reuse, unrelated-key invalidation, incomplete liked-card sets and explicit process-local snapshot bypass. The five new key-isolation tests failed before the fixes and passed afterwards.
2. `8ca04f21` — routed share mutations through canonical HTTP authorization and post-commit delivery; retained share headers on asynchronous fall-through; added missing author/move/settings/deletion signals; restored column/share/comment recovery and independent HTTP retry.
3. `ae242411` — centralized public native board refresh ownership; resolved Realtime from the API origin; added short-background and focus recovery, bounded event coalescing and deleted-overlay cleanup; preserved comment/inspection drafts; connected plant writes and both plant readers; reconciled wallet reads. Extracted the existing overlay frame hook unchanged to bring the previously over-limit public UI module below 800 lines.
4. Final regression pass — corrected the classroom bank refresh effect discovered by the full suite: entering an interest rate must not trigger a GET, old scope responses must not replace the current view, and network errors must be handled. Added the public two-client matrix to the verification checklist.

### Local verification evidence

- Full Vitest JSON report: **409 files, 2,264 tests passed, success=true, exit 0**. An earlier full run had one unhandled classroom-bank rejection despite passing assertions; it was fixed and the full suite rerun successfully.
- Root and mobile TypeScript checks passed.
- Mobile design-system check passed.
- Source line gate passed: **2,497 files**, all at most 800 physical lines.
- Production `npm run build` passed, including TypeScript and generation of 158 static pages.
- Encoding and whitespace checks passed. Build-generated `next-env.d.ts` changes are not included.

These are local working-tree checks, not a production latency measurement. Six
pre-existing development-only edits are intentionally retained unstaged
(AssignmentBoard, OmokBoard, ShadowAllianceBoard, SpeedGameBoard, GameHubCatalog
and their realtime transport source-contract additions). They are not part of
this public-feature delivery. The exact pushed source is separately checked by
the documented Windows workflow; its run status must be reported, not inferred
from local checks or a previous successful run. No signed store release or
physical two-client acceptance is claimed here.
