# Aura Board Figma Constitution

Status: **Normative**  
Scope: Aura Board product design, Figma structure, AI-assisted design
operations, and design-to-code handoff.

This document is the project constitution for Figma work. Feature-specific
design notes may add constraints, but they must not contradict this document
without an explicit project-level decision.

## 1. Source-of-truth hierarchy

When design artifacts disagree, use this order:

1. current product behavior and authoritative implementation contracts,
2. repository product/design specifications,
3. `../design-system.md`,
4. this constitution,
5. feature-specific design handoff documents and manifests,
6. READY Figma screens,
7. REVIEW/WIP/Exploration artifacts.

Figma is a product-design source of truth only when its canonical READY state
is kept aligned with implementation and repository docs. An old screenshot or
exploration is never authoritative by age alone.

## 2. File roles

The preferred commercial structure is three roles:

- **Aura Board · UI Library** — variables, styles, shared components, and
  documented variants.
- **Aura Board · Product** — canonical product flows and READY screens.
- **Aura Board · Exploration** — disposable concepts, visual alternatives,
  color studies, and speculative layouts.

The current project may remain in a transitional single-file structure while
migration is in progress. In that mode, the same separation must exist by
page/section and status. Ordinary feature work must not be blocked on an
immediate file split.

Creating a new Figma file requires an explicit reason. Existing feature
`fileKey` values are reused by default.

## 3. Page, section, and frame taxonomy

Product files use this hierarchy:

```text
File
└─ Feature Page
   ├─ Design Notes
   ├─ [WIP]
   ├─ [REVIEW]
   ├─ [READY]
   └─ [DEPRECATED]
      └─ Screen Frames
```

Feature pages group a product area, not a single state. States belong in
sections and frames. Do not create one page per minor state.

Recommended page naming:

```text
00 · Cover & Index
01 · Foundations
10 · Game · 노래 맞히기
11 · Game · 오목
12 · Toolkit · 학생 랜덤뽑기
13 · Classroom · 자리배치
90 · Review / WIP
99 · Archive
```

Existing files do not need to be renamed immediately. New work should converge
toward this model.

## 4. Lifecycle states

Every product design belongs to one lifecycle state:

`EXPLORE → WIP → REVIEW → READY → DEPRECATED/Archive`

- **EXPLORE**: intentionally divergent alternatives; not implementation truth.
- **WIP**: active construction; incomplete or unstable.
- **REVIEW**: coherent candidate awaiting decision or implementation
  validation.
- **READY**: the single approved canonical design for that product state.
- **DEPRECATED/Archive**: previously valid or rejected work retained only for
  history.

There may be many EXPLORE/WIP/REVIEW candidates, but only one canonical READY
representation per product state.

## 5. Naming conventions

Screen frames use stable, searchable names:

```text
SG / Teacher / T4 / Guessing
SG / Student / S1 / Guessing
Toolkit / StudentPicker / Ready
Toolkit / StudentPicker / Drawing
Toolkit / StudentPicker / Winner
```

Shared components use semantic names rather than visual descriptions:

```text
Game / SongGuess / Choice
Game / SongGuess / AudioPlayer
Game / Shared / ScoreRow
Toolkit / Shared / PrimaryButton
```

Avoid production nodes named only `Frame`, `Group`, `Rectangle`, `Copy`, or
generated numeric labels when a meaningful name is available.

## 6. Canonical-screen rule

For each real product state, keep exactly one canonical READY screen.

When a READY design changes:

1. update it in place when identity is unchanged, or
2. promote the approved replacement,
3. move the previous canonical version to DEPRECATED/Archive,
4. remove ambiguity from links, manifests, and feature notes.

Do not leave `v2`, `final`, `final-2`, and similar competing frames side by
side in READY areas.

## 7. Components, variables, and styles

Shared UI is a system, not repeated drawing.

- Reuse existing variables and semantic tokens before creating new values.
- Reuse existing components before creating new masters.
- Product screens use instances of shared components wherever practical.
- Component variants represent meaningful states or properties.
- Do not detach instances for local styling convenience.
- Do not create duplicate components with equivalent semantics.
- Feature-specific components stay local only when reuse outside the feature
  is not justified.
- Promote genuinely reusable patterns into the UI Library/component area after
  approval.

Figma variables and styles should map conceptually to the code design tokens in
`../design-system.md`. Raw one-off values require a documented reason.

## 8. Design-to-code mapping

Design work must be implementation-aware.

- Before modifying a canonical screen, inspect the relevant code and product
  contracts.
- Record key implementation references in the feature's Design Notes section
  or handoff doc.
- Prefer one Figma component concept per reusable code component concept where
  the mapping is stable.
- Use Code Connect when it materially improves handoff and the mapping is
  stable enough to maintain.
- Do not create Code Connect mappings for speculative components or one-off
  exploration frames.

Example:

```text
Figma: Game / SongGuess / Choice
Code:  src/components/SongGuessGame.tsx
```

## 9. Required state coverage

Commercial-ready design coverage is broader than the happy path. For each
feature, include every state that can materially change layout, comprehension,
or recovery, including where applicable:

- loading,
- empty,
- error and retry/recovery,
- disabled,
- submitted/saved,
- timeout/expired,
- disconnected/reconnecting,
- late join or access denied,
- success/reveal/completion,
- long text and large participant/data counts,
- phone, tablet, and desktop responsive states,
- reduced motion and accessibility-relevant behavior.

Feature contracts determine which states are actually required; do not invent
states unsupported by the product model merely to fill a checklist.

## 10. Responsive and accessibility baseline

- Verify phone, tablet, and desktop layouts where the feature is exposed on
  those surfaces.
- Avoid controls that depend on hover alone.
- Interactive targets should support at least 44×44 px touch areas where
  applicable.
- Preserve clear focus, selected, disabled, error, and success states.
- Do not rely on color alone to convey answer/result/state meaning.
- Check text wrapping, long Korean labels, score/count growth, and
  zoom-sensitive layouts.
- Respect reduced-motion requirements for motion-heavy game/toolkit
  experiences.
- Maintain contrast consistent with the project design system and
  accessibility goals.

## 11. Exploration and promotion

Exploration is encouraged but isolated.

When a user explicitly asks for alternatives:

1. create them in Exploration or a clearly labeled exploratory section,
2. keep shared production components untouched unless the user is explicitly
   evolving the system,
3. compare candidates against product constraints,
4. move only the selected candidate into REVIEW,
5. promote exactly one approved candidate to READY,
6. archive or delete disposable alternatives according to their historical
   value.

Exploration must never silently become production truth.

## 12. Design decisions

Each substantial feature page should maintain concise Design Notes with
decisions that future designers and AI agents must preserve unless intentionally
revised.

Recommended structure:

```text
Decision
- Auto setup is the primary teacher flow.
- Custom audio is an advanced flow.
- During guessing, teacher live rank remains secondary.

Implementation
- src/components/...

Last reviewed
- YYYY-MM-DD
```

Record rationale only when it will help future decisions. Do not turn Figma
into a duplicate product specification.

## 13. Manifests and feature handoff

If a feature maintains a Figma manifest, exported reference images, or design
handoff document, update them when canonical node IDs, variables, components,
or READY screens change.

For example, `song-guess/figma-manifest.json` exists to make important Figma
assets addressable from the repository. Such manifests must not point
indefinitely to superseded canonical nodes.

Feature handoff docs should clearly distinguish approved/current designs,
explorations, implementation status, and known mismatches or pending
validation.

## 14. Prohibited patterns

Do not:

- leave orphan production frames at page root,
- mix unrelated features on one product page,
- mix explorations into READY sections,
- keep multiple READY screens for the same state,
- detach instances just to patch a local screen,
- create duplicate components or duplicate semantic variables,
- create a new file/page simply because it is easier than finding the
  canonical destination,
- introduce product behavior in Figma without labeling it as a proposal,
- report completion without screenshot verification.

## 15. Mandatory AI workflow

All AI-assisted Figma work follows this fixed order:

**READ → CODE COMPARE → FIGMA WRITE → SCREENSHOT VERIFY**

The reusable cross-project instruction is
[`../ai/global-figma-design-ops.md`](../ai/global-figma-design-ops.md). This
constitution adds Aura Board-specific policy and taxonomy.

## 16. Handoff checklist

Before declaring a design task complete:

- [ ] Existing fileKey and canonical destination were reused or a new
      destination was explicitly justified.
- [ ] Relevant implementation states were inspected.
- [ ] Canonical READY screens are unambiguous.
- [ ] No loose or orphan production frames were created.
- [ ] Components/variables/styles were reused before new ones were introduced.
- [ ] Relevant loading/error/empty/submitted/timeout/reconnect states are
      covered.
- [ ] Responsive and accessibility-sensitive states were considered.
- [ ] Representative changed screens were captured and visually inspected.
- [ ] Superseded work was moved to DEPRECATED/Archive.
- [ ] Feature handoff/manifest links were updated when canonical IDs changed.
- [ ] Remaining design↔code mismatches are documented.

## 17. Definition of done

A Figma feature is ready for production handoff only when:

1. the product flow matches current implementation or explicitly approved
   product changes,
2. each relevant product state has one canonical READY representation,
3. shared UI uses maintained components and variables,
4. critical error/recovery and responsive states are represented,
5. accessibility-sensitive distinctions are visible in the design,
6. screenshot verification found no unresolved clipping, overflow, or
   hierarchy defects,
7. feature notes/manifests point to the current canonical design,
8. unresolved implementation differences are explicitly listed.

## 18. Migration plan for the current Figma state

Do not attempt a destructive one-shot cleanup of the current Aura Board files.
Migrate incrementally as features are touched.

For each feature on its next design change:

1. identify all existing pages/frames for that feature,
2. identify which current screen best represents each implemented state,
3. mark those as the temporary canonical set,
4. move obsolete alternatives into an Archive/DEPRECATED area,
5. consolidate obvious duplicate components and variables only when safe,
6. add or refresh Design Notes,
7. update repository manifests/handoff links,
8. continue future work by updating that canonical set rather than creating
   parallel copies.

The existing song-guess and random-picker explorations can remain historically
available during migration, but new production work must not add further
ambiguity.

