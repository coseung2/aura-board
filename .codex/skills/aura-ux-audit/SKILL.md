---
name: aura-ux-audit
description: Audit any Aura Board user-facing flow for missing required states/actions, lifecycle cleanup defects, stale or misleading status, unnecessary steps, redundant controls/copy/containers, leaked implementation state, slow synchronization, premature state disclosure, role mismatch, layout instability, and avoidable friction before implementation. Use for UX/UI 전수조사, 기능별 UX 정리, 리팩터링 전 검토, 모바일/웹 경험 점검, or simplification work.
user-invocable: true
---

# Aura Board UX Audit

Use this skill for any user-facing Aura Board feature, not only games. The target may be a board, modal, dashboard, toolkit, classroom flow, content surface, mobile screen, game, or cross-device workflow.

This is not a visual-only review. A useful UX audit follows the user's task through the actual implementation and checks whether the UI accurately represents the product state, authority boundary, synchronization model, and recovery behavior.

When a finding is specifically about how many decisions/actions a flow costs, use `.codex/skills/ux-flow-audit/SKILL.md` as the measurement companion. This skill owns lifecycle/state-truth/realtime/missing-or-redundant UX review; `ux-flow-audit` supplies reproducible KLM/excise cost for before/after comparisons.

## Source-of-truth order

Before judging a screen, read only the documents relevant to the target and then compare them with current code.

1. Repository instructions (`AGENTS.md`, relevant nested instructions).
2. Relevant product/feature docs in `docs/`.
3. `docs/verification-checklist.md` sections that cover the same feature or behavior.
4. Current rendered component/screen code.
5. The mutation/API path behind each important action.
6. The authoritative state, realtime/invalidation path, optimistic state, and persistence boundary.
7. Tests and incident docs when they explain an intentional boundary or prior regression.

Do not promote an observation from a fixture, incident, current production row, or current DB distribution into a permanent product rule. Stable behavior must come from an explicit product decision, versioned contract, or authoritative metadata.

Examples:

- Media duration comes from the asset/session metadata unless the product contract explicitly fixes a duration.
- Participant counts, round counts, item limits, timeout values, and option counts must not be inferred from current data unless the contract says they are fixed.
- A historical workaround in an incident report is evidence, not automatically a desired UX.

## Start with the user journey

For every target, identify the shortest real user journey before reviewing individual controls.

Record:

- viewer/role: teacher, student, owner, editor, parent, admin, anonymous, etc.
- entry point
- required user decisions
- system-owned preparation or validation
- active/task state
- completion state
- exit/retirement/cleanup state
- error/recovery state
- cross-device or cross-user propagation that the user can observe

Then ask for every visible step:

> Is this a real user decision, or did an implementation detail become a screen/button?

If a step exists only because the backend performs two operations, it should normally remain one user action. Preserve separate steps only when the user needs to inspect, approve, compare, schedule, or intentionally defer something between them.

## Audit dimensions

### 1. Missing required states, actions, and lifecycle cleanup

Do not audit only for things to remove. Check what must exist for the flow to remain truthful and complete.

Look for:

- a terminal entity that should disappear from a lobby/list but remains visible
- stale rooms, jobs, uploads, sessions, presence rows, queue tickets, or optimistic artifacts that survive after completion/cancel/leave
- `참여 중`, `진행 중`, `대기 중`, counts, badges, or availability labels that do not match authoritative state
- a list query that includes retired/finished/expired rows because its lifecycle predicate is incomplete
- missing empty, completed, disconnected, expired, cancelled, permission-denied, or recovery states
- a required continue/exit/retry/cancel action that is absent even though the state model allows it
- cleanup that depends only on the happy-path client unmount instead of an authoritative terminal transition, TTL, lease expiry, or reconciliation path
- duplicate/ghost presence caused by reconnect, crash, backgrounding, or lost leave acknowledgements
- status derived from a stale cache or local boolean while the authoritative state says something else

For every entity shown in a list or lobby, identify its visibility predicate explicitly:

`created → visible/eligible → active → terminal/expired → removed or archived`

Verify both directions:

- when it becomes eligible, it appears promptly
- when it stops being eligible, it disappears or moves to the correct historical surface promptly

Do not solve lifecycle defects by merely hiding a stale row in one component if the orphaned durable/runtime state still affects counts, matching, permissions, or future sessions. Trace who owns cleanup and whether cleanup is idempotent and recoverable after crashes or missed events.

### 2. Unnecessary actions and duplicated stages

Look for:

- prepare → save → create → start chains that can safely be one primary action
- explicit refresh/reload buttons while healthy realtime already owns synchronization
- duplicate submit/confirm controls for the same decision
- secondary actions competing visually with the one action needed to continue
- separate screens for server-owned validation or preparation
- confirmation dialogs for low-risk reversible actions

Do not remove a boundary solely to reduce clicks. Keep it if it protects an irreversible, destructive, financial, privacy-sensitive, or rule-changing action, or if it is a genuine review/approval decision.

### 3. Redundant copy and explanatory noise

Flag copy when the same fact is repeated by combinations of:

- eyebrow/kicker
- page title
- section title
- explanatory paragraph
- empty-state paragraph
- badge/status label
- button label

Prefer showing the current decision or state instead of narrating obvious interface behavior. Help text is valuable when it explains consequences, constraints, unfamiliar rules, or recovery—not when it restates the label directly above it.

### 4. Meaningless visual containers

Inspect card/panel/wrapper nesting. Remove or flatten containers that provide no grouping, interaction boundary, scrolling boundary, hierarchy, or responsive purpose.

Common smells:

- a single sentence inside its own bordered card
- a button wrapped in a standalone panel only for decoration
- cards inside cards that repeat the same heading
- full-page shells that add padding/background but no layout responsibility
- permanent status boxes for states that should be exceptional

Do not flatten structural containers required for focus management, semantic grouping, responsive layout, sticky regions, virtualization, or measurement.

### 5. Implementation-state leakage

Healthy internal state should usually be invisible.

Flag user-facing items such as:

- version numbers, run/session IDs, board IDs, request IDs
- `동기화됨`, `실시간 연결`, normal heartbeat indicators
- routine `최신 상태 확인`
- cache/reconciliation terminology
- server preparation phases that require no user action

Show connection state when the user must understand or act on degradation: reconnecting, offline, failed confirmation, stale conflict, retry required, or read-only fallback.

### 6. Realtime and stale-state UX

When the complaint is "늦게 반영된다", do not stop at the component.

Trace the complete path:

`user mutation → authoritative commit → immediate invalidation/update → peer/client receive → authoritative reconcile → UI render`

For multi-user or cross-device state, verify whether every user-observable commit that matters (join, leave, ready, create, start, update, delete, advance, finish, etc.) emits the correct fast-path notification.

Also verify that list/lobby membership and derived labels are invalidated on terminal transitions. A `finish`, `leave`, `cancel`, `expire`, or `delete` event is incomplete if peers refresh the detail view but the parent list continues to show the entity as active.

Preferred policy:

- authoritative server state remains source of truth
- realtime/broadcast/subscription is the normal fast path
- focus/network restore reconciles missed events
- polling is a bounded recovery path, not the healthy transport
- background refresh must not visibly replace a usable screen with loading UI
- routine refresh must preserve input focus, draft text, scroll position, and geometry when possible

Flag layouts where status text appears/disappears and pushes primary content around during ordinary refresh.

### 7. Premature disclosure and fairness

Internal truth is not always public truth.

Check whether the UI exposes information before the product intends to reveal it, including:

- score/rank changes before an answer/result reveal
- correct/incorrect counts that leak hidden outcomes
- future questions/options/content
- teacher-only answers or moderation state
- another participant's private submission or selection
- hidden workflow state that lets users infer a protected result

When necessary, separate internal evaluation/commit time from the public projection time. Do not weaken the authoritative server model merely to hide UI data.

### 8. Role-appropriate actions

For each CTA, verify that the current viewer both understands and owns that decision.

Flag:

- student controls that only a host can meaningfully use
- teacher controls for student-owned self-service flows
- read-only viewers seeing mutation affordances
- admin/debug actions leaking into production surfaces
- actions that are technically permitted but contextually nonsensical in the current phase

The UI should be derived from capabilities/role plus current state, not only from route identity.

### 9. Content and randomized-choice quality

For generated suggestions, distractors, recommendations, random choices, or automatic grouping, correctness is not enough. Review whether the generated alternatives preserve the intended difficulty and semantic context.

Examples:

- quiz distractors should come from a plausibly confusable semantic pool when the product intends difficulty
- random grouping should respect explicit grouping constraints
- recommendations should not escape the user's chosen category/filter unless the fallback is intentional and visible

Preserve enough source identity/category metadata through preparation and persistence so later stages can make quality decisions. Do not throw away metadata and then approximate quality from labels alone.

### 10. Media and time-based interactions

Do not hardcode media duration or timer behavior from current assets unless the versioned product contract fixes it.

Trace:

- authoritative duration/deadline metadata
- autoplay/unlock requirements
- background/visibility handling
- repeat/stop behavior
- timer and media synchronization
- what happens after the asset ends before the task deadline

Prefer one coherent task timeline over independent controls when the user does not need to control them separately.

### 11. Loading, recovery, and optimistic state

Distinguish:

- first load
- routine background reconciliation
- pending mutation
- committed optimistic feedback awaiting acknowledgement
- reconnecting
- offline
- recoverable error
- terminal error

Do not reuse a large first-load skeleton/state screen for an ordinary background refresh. Do not claim success before authoritative confirmation when correctness matters. If optimistic UI is useful, visually distinguish pending from committed state and define rollback/reconcile behavior.

### 12. Information hierarchy and task focus

Identify the one current task the user should see first. Check whether decorative status, help text, secondary management actions, sidebars, or metadata compete with it.

For task-heavy/full-screen flows, the active work should dominate the viewport. Navigation or management UI may need to collapse, move to overflow, or disappear temporarily if it increases accidental exits or steals space.

### 13. Responsive, touch, and accessibility behavior

Review the same state across phone, tablet portrait/landscape, and desktop where relevant.

Check:

- clipping and unreachable controls
- keyboard overlap
- modal/footer cutoff
- unnecessary nested scrolling
- rotation state loss
- touch targets for actual controls
- keyboard navigation and focus order
- screen-reader labels
- dynamic text/long Korean names
- color-only state communication
- reduced motion

Do not mechanically require 44px on dense domain surfaces where the interaction model intentionally uses a larger composite hit target; inspect the real accessible interaction instead.

## State-transition review

For stateful features, make a compact transition map before recommending deletions.

Example shape:

`entry → configure → ready/wait → active → review/result → complete`

Mark each transition with:

- actor who triggers it
- visible CTA
- server mutation
- authoritative state change
- realtime propagation
- what other viewers see
- whether the entity should remain visible in parent lists/lobbies
- cleanup/expiry owner and recovery behavior if the initiating client disappears

This exposes UI stages that exist only because implementation stages were mirrored directly.

## Severity

Use these defaults:

- **P0** — wrong result, hidden information leak, action/state mismatch, orphaned/terminal state presented as active, stale multi-user state that breaks the task, data-loss risk, unrecoverable flow, or misleading confirmation.
- **P1** — repeated friction in a core path, unnecessary required step, confusing competing CTA, frequent layout shift, slow propagation with workaround, or major role/hierarchy problem.
- **P2** — redundant explanation, decorative wrapper, minor hierarchy issue, wording duplication, non-blocking polish.

Severity is about user impact, not implementation difficulty.

## Output format

For an audit, report findings before editing unless the user explicitly asked for implementation.

For each finding include:

- severity
- feature/screen/state and viewer role
- concrete UI symptom
- code/component/API evidence
- root cause (UI-only, state model, realtime, contract, persistence, etc.)
- recommended user-facing behavior
- whether the fix is local or cross-cutting

Then separate:

1. cross-cutting/platform fixes
2. feature-specific fixes
3. missing essentials / lifecycle integrity fixes
4. safe removals
5. product-rule decisions that must not be guessed

When the user wants feature-by-feature cleanup, keep a stable checklist and finish one bounded feature at a time so later reviews use the same standard.

## Implementation guardrails

When moving from audit to code:

- preserve authoritative/idempotency boundaries
- fix lifecycle ownership and cleanup at the authoritative layer when stale UI is only the symptom
- do not replace realtime correctness with cosmetic hiding
- do not invent constants from production data
- do not silently change domain/game rules without an explicit product decision
- remove obsolete UI and tests rather than leaving dead alternate flows
- add regression tests for the user-visible failure that motivated the change
- verify web/mobile parity when both surfaces implement the flow
- use `docs/verification-checklist.md` as the verification source of truth

The goal is not "fewer elements" in isolation. The goal is the smallest interface that accurately exposes the decisions, state, and recovery actions the user actually needs.
