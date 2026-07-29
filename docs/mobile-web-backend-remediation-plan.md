# Mobile/Web/Backend Remediation Plan

This plan turns the July 2026 mobile/web parity and backend audit into bounded
implementation rounds. The mobile student app is the source of truth for pet
UX. Breakout work is explicitly excluded until the product scope changes.

## Goals

- Close security and data-integrity defects before visual parity work ships.
- Keep successful API response shapes and authorized user flows stable.
- Bring the web student experience toward the completed mobile experience,
  especially representative pets, achievement titles, replies, and play-board
  discovery.
- Add deterministic regression coverage for every backend defect fixed.
- Verify browser changes in the existing Whale session and mobile changes only
  on the Galaxy S23 assigned to this project.

## Completed Baseline

- Student login no longer accepts teacher-only callback targets such as
  `/dashboard`, preventing the login loop.
- Authenticated web users can read and write threaded card replies using the
  existing comment API contract.
- Web reading activity exposes the same record, mission, and title tabs as the
  mobile app, including title claim states and buffs.
- Breakout behavior was not expanded.

## Implementation Status (2026-07-28)

- Round 1 complete: quiz authorization, share-card ownership and section
  integrity, store/bank atomicity, and web pet/play discovery parity.
- Round 2 complete: atomic/idempotent role salary payout, retryable push
  reservations, fail-closed cron authentication, and post-commit blob cleanup.
- Round 3 complete in code: server-authoritative speed timing, race-safe DJ play
  events, Kordle compare-and-swap advancement and mobile recovery, and mobile
  quiz final-state refresh/error recovery.
- Round 4 confirmed accessibility/error-recovery work is complete in code and
  covered by focused keyboard, popup-menu, navigation, and logout tests.
- Round 5 complete: student Home/Boards/Pet/Self-directed/More information
  architecture, flat page composition, inline pet shop, and Reading/Walking
  activity tabs are implemented and verified in the existing Whale session.
- Product decision gates below remain intentionally unimplemented.
- Galaxy S23 runtime verification is pending because the assigned device
  `R3CW50BW8KB` is not currently connected; no other connected device may be
  used for this project.

## Round 5: Student Web Information Architecture

- Replace the student web primary navigation with Home, Boards, Pet,
  Self-directed, and More.
- Separate the full board explorer from Home into `/student/boards`, with
  Priority, Lesson, Play, and All content tabs.
- Keep the representative pet first on Home, but present it as a flat section
  rather than a decorative nested hero card.
- Give Pet three first-class sections: Mine, Classroom pets, and an inline
  Shop that follows the mobile category and purchase flow.
- Combine Reading and Walking under `/student/self-directed` with URL-backed
  activity tabs while preserving each activity's local content tabs.
- Preserve legacy student board, reading, and walking links through canonical
  redirects.
- Follow the teacher-screen composition contract: page title, section
  navigation, content tabs, then flat content separated by rhythm and rules.

## Round 1: Confirmed Critical Fixes

These slices are independent and may run in parallel.

### Quiz authorization and answer integrity

- Require an authorized teacher for quiz management and answer-key access.
- Bind student joins and submissions to the authenticated student session.
- Validate player, question, quiz, active phase, and current-question
  relationships on every answer.
- Cover unauthorized reads/writes, identity spoofing, cross-quiz submissions,
  stale questions, and valid play.

### Share-card ownership and section integrity

- Require the share guest identity to match `externalAuthorKey` before editing
  or deleting an externally authored card.
- Reject section changes and moves when the target section belongs to another
  board.
- Keep the ownership and section checks inside the mutation boundary where a
  race could otherwise bypass them.

### Store and bank atomicity

- Replace read-then-decrement flows with guarded atomic mutations.
- Create ledgers and receipts only after the guarded mutation succeeds.
- Return deterministic insufficient-stock or insufficient-balance conflicts
  when concurrent requests race.

### Web pet and play discovery parity

- Promote the representative pet to the first major student-home surface,
  using mobile as the hierarchy and visual reference.
- Keep wallet and assignments readable in responsive layouts.
- Prioritize active play boards and add accessible search/filter controls using
  data already present in the student dashboard payload.
- Replace permanent wallet loading on fetch failure with a retryable error.

## Round 2: Backend Reliability

Start after Round 1 integration so transaction patterns can be reused.

- Make classroom role salary payout atomic and idempotent as one batch instead
  of independent per-student commits.
- Make student and parent push dispatch retryable when the external send fails;
  a persisted pre-send row must not permanently suppress retries.
- Standardize cron authentication on `Authorization: Bearer CRON_SECRET` and
  fail closed when the secret is missing.
- Enqueue cleanup for replaced attachment blobs after the database mutation
  succeeds.

## Round 3: Play-Board Fairness and Race Safety

- Compute speed-game elapsed time from the server round start, not a trusted
  client value.
- Make DJ `played` transitions conditional so parallel requests create one
  play event.
- Advance Kordle puzzles with an expected-index compare-and-swap and return
  `409` for stale controllers.
- Make mobile Kordle discover a newly advanced puzzle after its current attempt
  finishes.
- Fix six-letter Kordle sizing for a 360 dp Galaxy S23 viewport.
- Refresh final quiz scores from the server and surface polling failures rather
  than leaving an endless spinner.

## Round 4: Navigation and Accessibility

- Add roving focus, arrow-key navigation, and connected tab panels to web board
  discovery tabs.
- Keep MegaNav panels available while keyboard focus moves into them.
- Add Escape, arrow navigation, focus containment, and focus restoration to
  context menus.
- Add retryable error states to teacher navigation, board detail, profile, and
  logout flows where failures currently look empty or silently disappear.
- Add non-color status cues to mobile Kordle cells and labels to quiz inputs.

## Product Decision Gates

Do not implement these until the user selects a policy:

1. Should unauthenticated share-link visitors receive threaded replies, or only
   authenticated teacher/student/parent users?
2. Should DJ, quiz, and vibe boards be exposed directly in the play-board
   creation menu, or remain lesson-created boards that may be recategorized?
3. Should quiz and speed-game replay reset the same room or always clone/create
   a new board?
4. Should the web student navigation adopt the mobile six-destination
   information architecture, or only align content and visual priority within
   the existing web navigation?

## Verification Gates

Use `docs/verification-checklist.md` as the source of truth.

- Every backend slice: focused route tests, authorization negative cases,
  concurrency/rollback probe, and `npm run typecheck`.
- Shared contracts: `npm run test`; the reading aggregate fixture now pins its
  system time so weekly reward assertions do not drift with the calendar.
- Web UI: clear/restart the dev server when practical, then verify student login,
  pet home, play filters, title claim states, and replies in the current Whale
  session.
- Mobile changes: run mobile typecheck/design checks and verify only on Galaxy
  S23 serial `R3CW50BW8KB`. Do not use other connected devices.
- Final integration: production build, diff-scope audit, and confirmation that
  unrelated generated wearable assets did not change.
