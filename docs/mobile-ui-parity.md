# Mobile UI Parity

Updated: 2026-06-18

## Source Of Truth

The web app is the design source of truth.

- Web tokens: `src/styles/base.css`
- Web design rules: `docs/design-system.md`
- Mobile token port: `apps/mobile/theme/tokens.ts`
- Mobile shared UI primitives: `apps/mobile/components/ui.tsx`

Mobile screens must not invent local colors, shadows, radii, or typography.
Hard-coded visual values belong only in the token port when they directly map
to web CSS variables or platform-level constants. Route and layout components
must compose tokens and shared primitives.

## Visual Rules

- Backgrounds use `colors.bg`; page shells should feel quiet and web-like.
- Primary surfaces use `SurfaceCard`, or the same token recipe:
  `colors.surface`, `colors.border`, `radii.card`, `shadows.card`.
- Framed tools inside an existing card, such as QR frames or media embeds, may
  stay flat when the frame is part of the tool rather than a nested card.
- Default mobile card shadow is intentionally restrained. Do not add per-card
  `elevation` or `shadow*` values in screens; use `shadows.card`, `lift`, or
  `accent`.
- Buttons use `AppButton`; icon-only controls use `IconButton`; floating
  actions use `Fab`; chips/badges use `Pill`.
- Repeated route headers use `AppHeader`; board-specific headers use
  `BoardHeader`.
- Pressable rows inside cards or sheets use `ControlPressable`; larger card
  targets use `SurfacePressable`.
- Full-bleed image/backdrop hit areas use `MediaPressable`, keeping raw
  `Pressable` inside shared primitives only.
- Sheet-style dialogs use `AppModal` so overlay, surface, keyboard avoidance,
  and accessibility defaults stay consistent.
- Side panels use `AppModal align="right"` instead of route-local drawer
  overlays.
- Typography uses the semantic `typography` roles: display, title, subtitle,
  section, body, label, badge, micro.
- Mobile typography keeps `letterSpacing: 0` across semantic roles. Do not
  copy web negative tracking values into route or component styles.
- Layering uses semantic `layers` tokens. Do not write numeric `zIndex`
  values in screens or components.
- Status colors use semantic tokens, not ad hoc green/red/yellow values.
- Route and component files should not use `style={{ ... }}` inline visual
  recipes. Add a named `StyleSheet` entry or shared primitive so the design
  gate can inspect the pattern.
- Responsive components use `useWindowDimensions`; avoid static
  `Dimensions.get("window")` snapshots in rendered components.
- Web safe-width behavior for exported/static web checks uses
  `apps/mobile/lib/responsive.ts` plus `responsive` tokens instead of
  route-local viewport math.
- Media/lightbox exceptions use explicit semantic tokens such as
  `colors.mediaBackdrop`, `colors.overlay`, and `colors.lightboxOverlay`.

## Migration Gate

Before changing a mobile screen, check:

1. Does this screen use route-local colors, radii, shadows, or button recipes?
2. Can those styles be replaced by `SurfaceCard`, `AppButton`, `IconButton`,
   `Fab`, or `Pill`?
3. Is the web equivalent already using a component pattern that has a mobile
   mapping in `docs/mobile-component-mapping.md`?
4. Does the screen still typecheck after the refactor?

If a component needs a visual value that does not exist in tokens, add a
semantic token first and document which web token or web component required it.

## Current Migration Order

1. Token sync and shared UI primitives.
2. Shell and navigation: landing, login, board shell, parent shell.
3. Card primitives: card view, composer, detail modal, engagement chips.
4. Board layouts: cards, columns, stream/read-only, plant, DJ, assignment,
   quiz, vibe arcade.
5. Parent flows: child list, child detail, board viewing.

This order avoids one-off screen patching by stabilizing primitives before
layout-specific work.

## Known Gaps

These are the remaining web-source-of-truth areas that need explicit mobile
ownership before parity can be considered fully proven:

- Full-screen media/sandbox modals are documented exceptions to the `AppModal`
  rule: `CardDetailModal`, plant `ImageLightbox`, and Vibe Arcade play mode.
- `CardDetailModal` uses `MediaPressable` for image/lightbox/backdrop hit
  areas, and shared controls for comment, file, link, form, and navigation
  actions.
- Canva/live embed wrappers such as `.card-canva-embed` are represented through
  `EmbeddedMedia`, but mobile-specific focus, loading, and error states still
  need visual parity checks.
- Web-only accessibility states such as `:focus-visible` and
  `prefers-reduced-motion` need mobile equivalents or documented non-applicability.
- Responsive grid rules are partially covered by `npm run design:check`
  blocking fixed `numColumns={2}` regressions. Broader breakpoint behavior
  still needs rendered viewport evidence.
- Mobile token regressions are checked by `npm run design:check` in
  `apps/mobile`. Run it with `npm run typecheck` and `npx expo config --json`
  before shipping mobile UI parity changes.
- Raw `Modal`, `Pressable`, and `TextInput` are blocked by
  `npm run design:check` outside the shared primitives and documented media
  exceptions.
- Inline style literals are blocked by `npm run design:check`; layout-only
  values still belong in named styles so mobile parity remains reviewable.
- Static `Dimensions.get("window")` usage is blocked by
  `npm run design:check`; use live viewport data so tablet rotation and split
  screen do not keep stale layout dimensions.
- Hard-coded `letterSpacing` and numeric `zIndex` values are blocked by
  `npm run design:check`; add or reuse semantic tokens instead.
- The design check also audits `theme/tokens.ts` so token-level letter spacing
  remains zero; do not bypass the rule by hiding tracking values in tokens.

## Verification Evidence

Latest local checks:

- `npm run typecheck`
- `npm run test`
- `cd apps/mobile && npm run typecheck`
- `cd apps/mobile && npm run design:check`
- `cd apps/mobile && npx expo config --json`
- `cd apps/mobile && npx expo export --platform web --output-dir ..\..\.codex\expo-web-export`

Rendered viewport evidence:

- Landing screen, 390 x 844: `.codex/artifacts/mobile-static-home-v17-390x844.png`
- Landing screen, 820 x 1180: `.codex/artifacts/tablet-static-home-wait-820x1180.png`
- Student login, 390 x 844: `.codex/artifacts/mobile-static-student-login-v17-390x844.png`
- Student login, 820 x 1180: `.codex/artifacts/tablet-static-student-login-v6-820x1180.png`
- Parent login, 390 x 844: `.codex/artifacts/mobile-static-parent-login-v17-390x844.png`
- 390 x 844 static pixel bounds leave right/bottom margin on landing, student
  login, and parent login after responsive token consolidation.
- Android emulator, Expo Go landing/login:
  `.codex/artifacts/emulator-student-login-closed.png`
- Android emulator, student home after `FXFDPZ` login:
  `.codex/artifacts/emulator-after-login-fxfdpz.png`
- Android emulator, anonymous board:
  `.codex/artifacts/emulator-anonymous-board-fxfdpz-2.png`

Runtime data evidence:

- Student code `FXFDPZ` loads 8 boards from `/api/student/me`.
- The anonymous board `역사, 문화 소개 글 쓰기` returns 21 cards, all with
  `anonymousAuthor` matching the board setting.
- The same anonymous board returns no mobile card author-name leaks and no
  comment author-label leaks for the `FXFDPZ` student session.
- After tightening nested layout payloads, the same `FXFDPZ` local API check
  reports 1 anonymous board and 0 leaks across top-level cards,
  `layoutData.assignment.slots[].card`, and
  `layoutData.vibeArcade.projects[].authorStudentId`.
- `/api/student/me` no longer returns the unused `quizzes` key.

Emulator verification:

- ADB was repaired by creating an ASCII-path AVD home at `C:\Android\avd`,
  creating `aura_ascii_api35`, and booting it headlessly:
  `emulator -avd aura_ascii_api35 -no-window -no-audio -no-snapshot-load
  -no-snapshot-save -no-boot-anim -gpu swiftshader_indirect -ports 5554,5555`.
- The healthy emulator reports `emulator-5554`, `sys.boot_completed=1`, and
  `package`, `window`, and `activity` services as found.
- Expo Go was installed by `npx expo start --android --host localhost --port
  8082 --clear` with `EXPO_PUBLIC_API_BASE=http://10.0.2.2:3001`.
- Student code `FXFDPZ` was entered in the native Android app. The student
  home loaded, and the anonymous board `역사, 문화 소개 글 쓰기` rendered card
  author chips as `익명`.
