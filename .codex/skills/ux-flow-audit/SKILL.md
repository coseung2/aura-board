---
name: ux-flow-audit
description: Use when measuring the interaction cost of an Aura Board flow before or after a change — counts KLM mental operators and excise steps with a reproducible script, so "이 동작은 두 단계다" becomes ΔM and seconds instead of taste.
user-invocable: true
---

# Aura Board UX Flow Audit — interaction cost

Measures **what a user goal actually costs** in an Aura Board flow: how many decisions
and actions it takes, and which of those steps are *excise* — work the product forces on
the user to satisfy its own implementation rather than the user's goal.

Scope boundaries:

- **Not a visual review.** Colour, spacing, typography and hierarchy look live in
  `docs/design/` and the Figma governance path (`AGENTS.md` → Figma design governance).
- **Not a lifecycle/state-truth review.** Missing states, stale or orphaned rows,
  role mismatch, implementation-state leakage and realtime propagation defects are a
  different audit. Follow the UX review guidance in `AGENTS.md` and its source-of-truth
  order for those, then come back here for the measurement.
- **Not a bug hunt.** A wrong value or a failing test is debugging.

What this skill adds to those is the **number**. It makes claims such as
"동작이 두 단계야", "이 버튼을 왜 눌러야 하지", "이 화면 한 번에 안 되네" reproducible: the same
flow scored twice gives the same ΔM and the same seconds.

## When to use

- A flow is reported as costing too many steps, or a step feels forced.
- A background job (sync, import, export, settle, publish, aggregate) appears as a button
  the user must press to make something current.
- Before/after comparison for a flow change — is the goal cheaper than it was?
- An audit's finding needs a defensible severity: is this a repeated friction on a core
  path (P1) or polish (P2)?

**Don't use for:** visual design changes, missing features, or a specific wrong result.

## Core model — three rules

**1. A button is an action; a background job is a state.**

```
sync:  idle ──(event)──> running ──> ready
```

State is *presented*; the user does nothing. The moment it becomes a button you have
invented a transition that exists only so the user can time it. That is excise by
construction — the server's scheduler leaked into the interface.

**2. Cost is the number of mental operators (M), not the number of clicks.**

A press is 0.10 s. Preparing for one is 1.35 s. Each added step adds an M, so "one more
button" costs ~2.5 s *and* breaks flow — not 0.1 s. Table and worked examples:
`references/klm-operators.md`.

**3. Excise is judged against a persona's goal, not by counting steps.**

The same step is goal-directed for one persona and excise for another. Ask per step:
(a) does it advance this persona's goal? (b) is it *forced* on them or left to their
discretion? Forced + off-goal = excise. Taxonomy and the forced/discretion test:
`references/excise-taxonomy.md`.

Aura Board is multi-persona by construction — teacher, student, parent, admin — so a step
that is legitimate on one surface is frequently excise on another (`/classroom/[id]/*`
teacher management vs `/b/[slug]` student submission vs `apps/mobile`). **Always name the
persona before labelling a step.**

## Prerequisites

- `python3` — stdlib only, for `scripts/klm_score.py`
- A running app when a flow is *walked* (not required for scoring a path already
  traced through the code):
  - Web: `infisical run --env=dev -- npm run dev` (development secrets come from
    Infisical — a plain `npm run dev` is not a database-backed app)
  - Combined web + Expo: `.codex\scripts\start-dev-servers.ps1`
  - Song-guess rooms additionally need the Rust play-engine; order and scripts are in
    `docs/authoritative-play-platform.md#local-development` (DB tunnel → play-engine on
    8090 → next-with-engine). Routes answer 503 until it is up — that is not a UX
    finding.
- Reference environment variable **names** in reports — never paste values, tokens, or
  connection strings.
- Verification source of truth: `docs/verification-checklist.md` (see
  `#scheduled-job-changes` and `#oracle-production-deployment` when the flow depends on a
  scheduled job or on the self-hosted deployment).

## How to run

1. Write the goal the way the user says it — "학생 기록 확인하고 저장하기", not
   `PATCH /api/...`.
2. Derive the shortest conceivable path: which transitions could the *system* perform
   unasked (scheduled job, webhook, realtime subscription, optimistic update)?
3. Walk the real flow and log every step actually taken; then score both paths.
4. Classify each step, and apply Core Model rule 1 to any step that only triggers
   background work.

## Quick reference

| Operator | Meaning | Seconds |
|---|---|---:|
| `M` | mental preparation (decide) | **1.35** |
| `P` | point (move to target) | 1.10 |
| `H` | hand move (keyboard ↔ mouse) | 0.40 |
| `K` | keystroke | 0.20 |
| `B` | button press | 0.10 |

```bash
# explicit operator sequences, one per argument
python3 scripts/klm_score.py score "M K K" "M H P B M P B"
# labelled steps — each step is assumed to be M P B
python3 scripts/klm_score.py steps "설정 열기" "동기화 누르기" "새로고침"
# prove the operator table against the textbook examples
python3 scripts/klm_score.py selftest
```

Route and screen inventory (94 web routes, 47 mobile route files): `flows.md`.

## Procedure

1. **Pick the flow; state the goal in the user's words.** Criterion: a teacher, student or
   parent would recognise the sentence as something they wanted to do.
2. **Derive the shortest conceivable path.** Name each transition the system could
   perform unasked **with its trigger, and its real latency read from the deployed
   schedule** — not from the word "자동" in the copy. A worker that runs once a day is not
   automatic for someone who checks their phone mid-morning.
3. **Walk the real path** and log every step, including the ones the UI forces that a
   shortcut would skip. Criterion: the log replays to the same end state.
4. **Score both paths** and report the delta (ΔM, Δseconds). Criterion: every number comes
   from `klm_score.py`, never from estimation.
5. **Classify each actual step** as goal-directed or excise, and name the forced labour
   (cognitive / memory / visual / physical) **and the persona** it serves or fails.
6. **For every background-trigger step, propose the state.** Convert
   `idle→(click)→running` into `idle→(event)→running`. Criterion: the proposal names a
   concrete event source and leaves no user action behind.
7. **Report only what was measured**; mark the rest as hypotheses. Criterion: every claim
   traces to a logged step, or is explicitly flagged as unverified.

If the app cannot be booted (no secrets, port already used, or the flow would mutate real
data), audit from the code path and **say so in the report**. A deterministic read of the
component tree plus the mutation API is legitimate evidence; a fabricated walk is not.

## Report format

```
목표: <사용자 말투의 목표>            (persona: 교사 / 학생 / 학부모 / 관리자)
실측 경로: <step> → <step> → …      (n steps, M=m, ~T s)
최단 경로: <step> → <step>           (n steps, M=m, ~T s)
Δ: M +x / +y s
excise: <step 라벨> — 강제된 노동: <인지/기억/시각/물리>, 페르소나 목표 아님
제안: <step> 버튼 → <event> 트리거 상태
검증 필요(가설): <unmeasured claims>
```

## Pitfalls

1. **Judging by click count.** Fewer clicks is not the goal; fewer *decisions* is. A
   two-click path through visible options can beat one click that needs a mode switch.
2. **"Optimising" a step that is genuinely the user's call.** 제출/승인/결제 is not excise;
   a forced refresh usually is. Forced vs discretion is the deciding test.
3. **Auto-refreshing stable content.** Where data changes often, silent polling adds its
   own excise (flicker, lost scroll/selection, interrupted typing). Offer "새 항목 3개"
   instead of shifting content under the user.
4. **Counting a modal as one step.** Open + confirm is two M, and the second is where the
   excise hides.
5. **Treating web and mobile as one cost model.** Tap target and gesture costs differ, and
   the surfaces are implemented separately (`src/app/**` vs `apps/mobile/app/**`). Score
   them separately, even when the flow is "the same".
6. **Proposing a UI fix for a deployment constraint.** When a manual button exists to
   compensate for something the *deployment* made slow (a scheduled job draining a
   real-time queue, a granularity limit on the plan/scheduler), the excise is real but the
   fix is not in the UI. Removing the button without fixing the trigger makes the flow
   worse. Report the constraint as the root cause; gate the removal behind it.
7. **Trusting intended confirm coverage.** Read the handlers, not the design intent.
   Asymmetric guarding — a confirm on the reversible action, none on the one that writes —
   is common and invisible in review.
8. **Believing the page's own copy.** "자동으로 반영됩니다" next to a manual button is the
   product admitting the automatic path is too slow. Treat the copy as evidence, then
   measure the path it describes.

## Verification

- `python3 scripts/klm_score.py selftest` prints `OK` (Ctrl+S = 1.75 s, menu = 5.50 s)
- Every route/screen named in a report exists in `flows.md` (or is added to it in the same
  change)
- Every reported number traces to a `klm_score.py` invocation shown in the report
- Every removed step/button has a proposed trigger naming a concrete event source
- The report names the persona and the surface (web/mobile) it was measured on
- `npm run typecheck` and `npm run test` still pass when the audit also changes code

## Maintenance

The canonical copy of this skill lives **in this repository** at
`.codex/skills/ux-flow-audit/`. Edit it here; do not keep a private duplicate on a machine.
Keep machine-local absolute paths, secret values and environment-specific identifiers out
of this directory — the repository is public.
