# Mobile tablet UX implementation plan

Baseline: `1f699312` on `main`, 2026-09-07. Scope is native mobile UI; no server/API, authorization, store submission, or production-data changes.

## Rechecked findings

- Percentage `maxHeight` alone is not a defect. Existing scrollable composers must retain their keyboard, touch responder, native-input lifecycle and draft behavior.
- The shared native Modal primitives omit iOS `supportedOrientations`. App-level orientation support does not replace this setting.
- Non-scrolling purchase/reason/stage dialogs can make actions unreachable. Game screens also need bounded scroll ownership, not nested scroll wrappers everywhere.
- Android edge-to-edge and iPad multitasking require all four safe edges and current container dimensions. Do not equate a wide window with a particular device model.
- The current portrait-only readable-width policy excludes landscape windows. Changes must retain existing list and form state across resize.

## Commit stages

1. **Adaptive overlay foundation**: pure tested geometry; explicit modal orientations; safe edges; measured keyboard-adjusted content bounds; width-capped bottom sheets; reusable opt-in scroll body and persistent footer. Preserve backdrop/input/drag semantics.
2. **Reachable dialog actions**: migrate purchase, no-photo reason, stage detail, walking settings/onboarding and game exit prompts to scrollable bodies; maintain footer access and existing save/draft rules; remove minimum-height conflicts in sheets.
3. **Game layouts**: implement the game shell's scroll contract and real HUD space, preserve list-owned scrolling, make speed-game states scrollable/keyboard-aware, and provide a short-wide quiz layout with scroll fallback and untruncated answers.
4. **Tablet reading and safe edges**: readable-width policy independent of orientation, bounded sheet/card sizing, robust moderation anchors, safe image/project viewers and consistent screen/navigation edge ownership.
5. **Regression and verification**: geometry/component/structural regression tests, design-check coverage for extracted screens, update the single verification checklist, run mobile checks and applicable repository tests. Push only after all local stages are committed. Dispatch Android verification for the final commit on the existing GitHub Actions Windows runner.

## Acceptance and verification

Use [verification-checklist.md](verification-checklist.md#mobile-tablet-rotation-and-short-height) as the single verification source. Android pipeline details remain in [mobile-android-build.md](mobile-android-build.md#github-actions-windows-validation).

Viewport matrix: 430×932, 932×430, 800×1280, 1280×800, 1366×1024 and narrow/short resizable windows. Check keyboard closed/open, rotation with a dialog open, font scales 1.0/1.3/2.0, long text, loading/error states, and preserved drafts. Unit tests are not a substitute for native-device keyboard/rotation validation. Record unperformed device checks explicitly.
