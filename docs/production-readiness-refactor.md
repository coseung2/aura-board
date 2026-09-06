# Production readiness refactor — 2026-09-07

Baseline: `e101dd01` on `main`, clean checkout, aligned with `origin/main`.
Scope: release-policy drift, development surfaces, authorization/data minimization,
recoverable UX, and avoidable reads. No production database changes or deployment.
Each stage is committed separately; push only after final verification.

## Stage 1 — Contain authentication and data exposure

- Retire the unused email-only parent signup and its legacy magic-link callback;
  neither may expose login links or issue sessions. Current password/OAuth login
  remains unchanged. Old leaked links must not remain usable.
- Enforce authenticated board/project ownership and moderation on project detail
  and play routes, and verify the destination board when saving Agent work.
- Restrict experimental Agent entry/API access to administrator classrooms.
- Return only the current student's private assignment payload; peer rows contain
  only the name/number/submission status needed by the existing progress UI.
- Tests: retired routes without side effects, own/foreign/anonymous/draft access,
  Agent destination validation, peer DTO privacy.

## Stage 2 — One release and administrator policy

- Define explicit stable/development feature and layout policies outside React.
- Preserve the current four stable creation layouts: freeform, columns, DJ queue,
  plant roadmap. Keep existing administrator test access; reject unknown layouts.
- Unify administrator evaluation with AURA_ADMIN_EMAILS; do not encode operator
  identities in clients or duplicate the allowlist in page/API implementations.
- Disable operational test routes and protect internal design/setup surfaces.
- Tests: normal/admin/admin-classroom audiences, unknown values and environment
  overrides, UI/API agreement.

## Stage 3 — Apply capabilities and reduce unnecessary reads

- Apply the same policy to teacher/student navigation, mobile menus and deep links,
  board creation/clone/entry and restricted feature API families.
- Return server-computed product capabilities in the student home response. Older
  cached mobile responses without capabilities default to restricted access.
- Filter unreleased board layouts before serializing lists. Preserve public shared
  stable boards and existing classroom RBAC; a release gate never replaces RBAC.
- Official game detail must resolve authorization/metadata before card/section
  queries, and parent-only/private payloads must never enter shared caches.
- Tests: non-admin deep-link/API denials, admin success, missing-capability cache,
  list filtering and metadata-first query behavior.

## Stage 4 — Recoverable UX and bounded interactions

- Billing: require login, distinguish loading/error, retry, cancellation errors.
- Mobile menu preferences: prevent concurrent saves and rollback failed changes;
  do not allow edits before preferences finish loading.
- Core card/board mutation failures: preserve drafts, rollback only affected state,
  present useful errors, avoid treating failed requests as successful saves.
- Repair experimental Agent preview parsing and remove clickable empty settings.
- Keep existing visual language; do not introduce a global UI/provider migration
  unless required by the actual changed call sites.

## Stage 5 — Regression and documentation

- Run targeted tests and complete web/mobile suites, web/mobile typechecks,
  check:lines, mobile design checks, and production/export builds when supported.
- Record exact commands/results and remaining runtime/device checks in the final
  report; use verification-checklist.md as the only verification checklist.
- Update current feature/API documentation for retired and gated surfaces.
- Review the final diff, verify clean commits and remote ancestry, then push main.

## Constraints and audit corrections

- A missing badge alone is not an authorization bug. Labels and guards are separate.
- Retain legitimate setup/empty states and existing stable pet/reading/walking/
  portfolio/Canva/share functionality.
- Parent test routes already enforce parent scope; their issue is unnecessary
  production availability, not demonstrated cross-parent leakage.
- The old `as` cookie has no auth consumer; remove obsolete plumbing without
  claiming that it currently grants privileges.
- Do not apply destructive legacy-game migrations or globally revoke sessions.
- Source tests do not establish production deployment, database round trips, or
  physical-device behavior. Those require separate operational verification.
