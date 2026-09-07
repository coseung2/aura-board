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

## Implementation outcome (2026-09-07)

| Stage | Commit | Outcome |
| --- | --- | --- |
| 1 | `d04fbfb8` | Adaptive native overlay geometry and orientation support. |
| 2 | `3b41e5e1` | Scrollable dialogs, separately reachable actions and bounded sheets. |
| 3 | `e3069861` | Real game scroll ownership, non-overlapping HUD and adaptive quiz. |
| 4 | `e27aa871` | Readable tablet feeds, safe page/viewer edges and fitted moderation menus. |
| 5 | This verification commit | Structural regression guards, local overlay measurements, extreme-height footer fallback, expanded design scan, checklist and CI verifier tests. |

Local verification passed: repository and mobile typechecks, mobile design scan,
115 mobile tests, 87 repository mobile-integration tests, 14 Android ELF verifier
tests, release-input checks, asset checks and whitespace checks. `rtk` is absent
in this workspace; equivalent npm commands were used directly.

The structural checks caught two remaining parent-auth callback screens with
missing lateral safe edges; both were corrected. Menu geometry now measures
its actual root instead of assuming a route overlay spans the whole window.
When a footer itself exceeds an exceptionally short window, it also scrolls.

The baseline Windows run `34069069051` failed because the ELF verifier applied
the 64-bit 16 KB rule to a 32-bit library. The ABI-aware correction and regression
tests preserve 32-bit tablet support without weakening 64-bit checks; details
are in the Android build document. The Windows workflow must be dispatched
against the final pushed commit and its result recorded separately.

No physical Android/iPad, native keyboard/IME, rotation-rendering or accessibility
focus acceptance was performed. No store upload, production release, app version
change or database/API modification is included. Native CI acceptance remains
separate from successful local checks and Git push.
