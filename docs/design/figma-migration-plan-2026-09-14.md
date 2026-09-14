# Figma migration plan — 2026-09-14

## Evidence

- File: I74zYjs7O4bOtFAwahqfza
- Read-only inventory completed for all 11 pages; detailed descendants captured to depth 2.
- Code comparison: SongGuessGame renders teacher/student lobby, guessing, reveal, finished, multiple-choice and free-text paths. SongGuessPlayer covers loading, playback, replay, missing audio and playback error.

## Classification

| Area | Decision | Evidence |
|---|---|---|
| 01 디자인 토큰 | canonical foundation | current CSS/token references |
| 02 교사 컨트롤 | canonical shared library candidate | Button/Field component sets |
| 03 학생 게임 컴포넌트 | canonical shared library candidate | student component families |
| 10 교사 화면 | canonical product candidate | handoff flows and implementation |
| 20 학생 화면 | canonical product candidate | handoff states and implementation |
| 30/31 게임 리디자인 | review/candidate | redesign generations need approval check |
| 90 탐색 시안 보관 | archive/exploration | explicitly named archive page |
| 91/92 플로우 v2 | review/candidate | newer flow set; preserve pending approval and consumer checks |

## Migration batches

1. Deep-read descendants, components, instances, variables, aliases, styles,
   prototype links and approval notes for pages 10, 20, 30, 31, 91 and 92.
2. Compare each screen by role, platform, breakpoint and state with web/mobile
   implementation and the manifest.
3. Mark one canonical READY screen per identity in Design Notes.
4. Move only confirmed superseded candidates into Archive or Deprecated sections.
   Preserve approved originals and node IDs; do not delete them.
5. Consolidate shared components only after consumer and override checks.
6. Read back structure and take screenshots after every batch; update manifests
   only after verification.

## Deep-read findings

- `30 · 게임 리디자인 · 5상태` contains random-picker screens and many student
  card instances. It is unrelated to the current SongGuess canonical flow and
  remains exploration/archive material.
- `91 · 노래 맞히기 전체 플로우 v2` contains teacher setup screens and uses
  instances from the v2 component page. It is a review candidate, not yet
  canonical, pending approval and implementation alignment.
- `92 · 플로우 v2 컴포넌트` contains `RankRow`, `AnswerCard`, `Chip`, and
  `Button` masters. Similar semantics do not yet justify merging them into
  earlier component families without consumer and override proof.
- `31 · 게임 리디자인 · 컴포넌트` remains a review candidate until its
  instances and approval provenance are checked.

## Completed batch 1

- Renamed page `59:25` from `30 · 게임 리디자인 · 5상태` to
  `99 · Archive · 랜덤뽑기 탐색`.
- No frames, components, instances or approved content were deleted or
  reparented.
- Read-back confirmed the archive page content remains addressable. Screenshot
  verification completed for frame `60:2` at 560×760.

The remaining SongGuess v2 pages stay in REVIEW until approval provenance and
consumer relationships are resolved. Component merging and further writes are
deferred to the next reversible batch.

## Completed batch 2 — Kordle (꼬들) canonical pages

Kordle had no Figma presence at all, so this batch created its canonical
structure from the current implementation rather than migrating old mockups.

Pages created:

- `146:2` — `14 · Game · 꼬들` (Design Notes plus `[WIP]`, `[REVIEW]`,
  `[READY]`, `[DEPRECATED]` sections)
- `146:3` — `15 · Game · 꼬들 · 컴포넌트`

Variables: 50 created in `Kordle · Primitives`, aliased by `Kordle · Semantic`.
Colors are taken verbatim from `src/features/kordle/components/kordle-gameplay.css`
— correct `#16a34a`, present `#f59e0b`, absent cell `#475569`, absent key
`#64748b`, empty cell `#f8fafc` on `#cbd5e1`, action key `#e2e8f0`. Spacing
tokens mirror the CSS gaps (5 / 6 / 8), radius 6, key min height 54.

Components:

- `Kordle / Cell` (`146:66`) — Empty, Typing, Correct, Present, Absent
- `Kordle / Key` (`146:77`) — Default, Correct, Present, Absent, Action
- `Kordle / ResultCard` (`160:562`) — Won, Lost, Ended
- `Kordle / TeacherControls` (`161:2`) — locale toggle, word input, create,
  random, start, stop, word count
- `Kordle / PetAvatar` (`177:12`) — Blue, Green, Yellow, Purple, Red. Filled
  with the real `public/creatures/slimes/{color}/idle.gif` first frame, upscaled
  4x with nearest-neighbour so the 64px sprite stays crisp.

## Background change and its contrast consequences

The board background moved from the code's five-stop rainbow gradient to a
neutral slate (`#e8edf4 → #cfd8e6`). Kordle's correct/present/absent cells are
the only signal that carries answer state, and a saturated backdrop competed
with them.

Three calmer candidates were drawn and compared in `[REVIEW]`: solid indigo,
blue-to-teal, and neutral slate. Neutral slate was chosen. The code-faithful
rainbow frame is kept there as the labelled baseline.

A light board invalidates every surface treatment that assumed a vivid
backdrop, so the following were changed together rather than separately:

- white cards gained a `#cbd5e1` border and a soft shadow to separate from the board,
- header and waiting-room text moved from `#ffffff` to `#0f172a`,
- translucent panels (`kordle-winner-info`, teacher live panel, status pill,
  control bar) became opaque; translucency only reads over a saturated fill,
- the waiting roster gained a card container, because that screen has no card
  and the CSS relies on 84px white display type to fill the viewport.

This is now applied in code as well as Figma. See the implementation section below.

Screens in `[WIP]` (`149:8`), all composed from those instances:

| Screen | Node | Implementation reference |
|---|---|---|
| S0 · 대기실 | `151:975` | `KordleWaitingRoom.tsx` |
| S1 · 진행 (한글) | `150:119` | `KordleBoard.tsx`, `KordleGrid.tsx`, `KordleKeyboard.tsx` |
| S2 · 입력 오류 | `151:60` | `guessErrorMessage` in `KordleBoard.tsx` |
| S3 · 결과 (승리) | `151:168` + `151:245` | `KordleResultModal.tsx` |
| S4 · 진행 (영문) | `151:981` | `KordleKeyboard.tsx` EN_ROWS |
| T0 · 교사 설정 | `152:234` | `KordleTeacherBoard.tsx` |
| S5 · 결과 (패배) | `155:1000` + `155:1077` | `KordleResultModal.tsx` LOST |
| S6 · 결과 (진행자 종료) | `155:1089` + `155:1166` | `KordleResultModal.tsx` `host_ended` |
| T1 · 교사 실시간 | `155:264` | `KordleTeacherBoard.tsx` live, `KordleTeacherParticipants.tsx`, `KordleLiveToasts.tsx` |
| R1 · 태블릿 834 | `155:1294` | `kordle-result-and-responsive.css` above the 760px breakpoint |
| R2 · 데스크톱 1440 | `155:1429` | `.kordle-play-layout` two-column with `.kordle-winner-info` |

Verification: every screen and both component sets were screenshot-inspected.
Two `use_figma` failures were diagnosed rather than retried blindly.
`layoutGrow = 1.7` is rejected because only 0 or 1 are valid, so ENTER and BACK
use a fixed 50px width; variant frames also needed explicit `FIXED` sizing
because auto-layout had collapsed them to glyph width.

Breakpoint frames follow the CSS rather than being scaled copies. R1 restores
key height 54 and font size 20 because the `max-width: 760px` overrides
(height 50, font 17) no longer apply at 834px. R2 uses the two-column
`.kordle-play-layout` with the winner panel at 190px and the board at 420px.
Screenshot review also caught three layout defects that were then fixed: live
toasts floated mid-screen instead of bottom-anchored, and the tablet and
desktop frames left large bottom gaps until their main axis was centered.

The three result cards were first drawn as plain frames, then consolidated into
the `Kordle / ResultCard` variant set; all three screens now use instances and
the duplicated frames were removed. `Kordle / TeacherControls` was extracted
the same way and instanced into both T0 and T1, so the teacher control bar has
a single master. T1's status bar, control bar and live layout were grouped into
a `live-main` stack so the toast rail stays bottom-anchored per its fixed CSS
position.

Code Connect mapping was attempted for both component sets and rejected — the
account lacks a Dev or Full seat on an Organization/Enterprise plan. Code paths
and CSS class names are recorded in each component's `description` instead, so
handoff still resolves design to code.

These screens stay WIP. Promotion to READY needs a human approval decision.

## Remaining gaps

- Winner toast firework and rise animations exist in CSS keyframes; the Figma
  frames show the resting state only.
- Control-bar states are drawn in one representative combination. Disabled
  create/random, the invalid word count (`is-invalid`), and
  `.kordle-control-error` are documented in the component description but not
  yet separate variants.
- `KordleWaitingRoom` uses the Jua display font in CSS; the Figma frames use
  Noto Sans KR Black because Jua is not available in this file's font set.
- Interaction behavior, focus order, and contrast were not verified. Static
  screenshots cannot establish those; they need prototype or running-app checks.

## Implementation — waiting-room pets and neutral board

Both changes are now in code, not only Figma.

Kordle's waiting roster previously rendered names only: `GameParticipant` had
just `id`, `name` and `joinedAt`, so there was no pet to draw. SongGuess already
resolves `representativePet` from the classroom, and that pattern was reused
rather than invented again.

- `src/lib/pets/character-only-items.ts` — keeps only items that draw on the
  character (`wearable`, `drink`, `food`, `prop`) and drops scene furniture. Of
  85 catalog items, 37 are kept; 30 backgrounds and 18 vehicles are dropped, and
  no item declaring a `floor` ever passes. Buff and set maths keep using the
  unfiltered equipped keys — this projection is for sprite composition only.
- `src/features/games/components/GameParticipantPet.tsx` — renders
  `SlimeCharacterSprite` with `hostBackground={false}`, falling back to the
  `UserRound` icon when a student has no representative pet.
- `GameParticipantsList` renders the pet chip only when `representativePet` is
  present, so other games that share `GameWaitingRoom` keep the name-only chip
  until they supply pet data.
- `src/features/kordle/server/kordleParticipantPets.ts` — classroom-scoped
  lookup, so a stale roster cannot leak a pet from another classroom.
- Both `/api/kordle/boards/[boardId]/puzzle` and `.../participants` now return
  `representativePet`. Supabase presence carries connection identity only, so
  `KordleWaitingRoom` caches the pet mapping from the HTTP snapshot and merges it
  into presence rows.

Verification: `tsc --noEmit` clean, `next build` succeeded, 24 existing tests in
`src/features/games`, `src/features/kordle` and `src/app/api/kordle` pass, and 4
new tests in `src/lib/pets/character-only-items.vitest.ts` cover the exclusion
contract. Authenticated multi-student rendering of real equipped items is still
a manual check; the automated tests cover the filter, not the sprite output.
