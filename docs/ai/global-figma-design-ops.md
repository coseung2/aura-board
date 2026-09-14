# Global AI Instruction: Figma Design Operations

This document is intentionally project-agnostic. It is the copy-ready portion
that can be registered as a global AI instruction for design work across
projects. Project-specific taxonomy, naming, source-of-truth, and release rules
belong in each repository's design constitution.

## Default behavior

- Default to **UPDATE**, not CREATE.
- Reuse an existing Figma file and canonical screen when one already exists.
- Enter **EXPLORE** mode only when the user explicitly asks for alternatives,
  variants, concepts, or visual exploration.
- Never treat multiple competing mockups as simultaneously canonical.

## Required order of work

For product design work, follow this sequence:

1. **READ** — inspect the existing Figma hierarchy, canonical screens,
   components, variables, styles, and notes.
2. **CODE COMPARE** — inspect the implemented product flow, states, contracts,
   and relevant tests.
3. **FIGMA WRITE** — modify the correct canonical destination and reuse the
   design system.
4. **SCREENSHOT VERIFY** — render representative changed states and inspect for
   visual defects.

Do not skip directly from a user request to drawing new frames.

## Canonical-design rules

- Decide where every node belongs before creating it.
- Do not leave loose or unnamed production frames on the page root.
- Do not create a new page when an existing canonical feature page is the
  correct destination.
- Do not create duplicate components that have the same semantic purpose.
- Do not detach component instances merely to make local visual changes.
- Reuse existing variables, styles, and components before inventing
  replacements.
- Shared component masters belong in the designated component/library area,
  not inside feature mockups.
- Product screens should be composed from instances wherever practical.

## Product truth vs exploration

- Exploration must be visibly separated from production design.
- Experimental layouts, colorways, and concepts must not be mixed into READY
  product sections.
- When one candidate is approved, promote only that candidate and archive or
  deprecate superseded alternatives.
- Proposed product behavior that does not exist in code must be labeled as
  proposal/review work rather than silently presented as implemented behavior.

## Required product states

For commercial product work, do not stop at a single happy-path mockup. Check
the states that are relevant to the feature, including loading, empty, error
and recovery, disabled, submitted/saved, timeout, disconnected/reconnecting,
permission/access denial, responsive breakpoints, and accessibility or
reduced-motion behavior.

The exact required states are defined by the project constitution and product
contracts.

## Verification

After every meaningful Figma write:

- capture representative screenshots,
- inspect clipping, overflow, spacing, hierarchy, and text wrapping,
- verify responsive layouts where applicable,
- verify state distinction and interaction affordances,
- verify accessibility-relevant contrast, labels, and touch/focus behavior
  where the design exposes them.

Do not report visual completion without screenshot verification.

## Completion report

When finishing a design task, report:

- canonical frames updated,
- components/variables added or changed,
- explorations promoted, deprecated, or archived,
- screenshots verified,
- unresolved design↔code mismatches,
- follow-up needed before implementation or release.

