# Mobile-Web UIUX Parity Plan

Updated: 2026-06-15

## Goal

Make the Expo mobile app feel functionally and visually equivalent to the web app for student and parent users, then upload a verified Expo build.

Parity means the same user should be able to complete the same core task with the same information architecture, brand language, feedback states, and detail interactions. Native controls may differ where platform conventions require it, but no web-only core workflow should be absent in the mobile app.

## User Scopes

- Student: code login, board list, board detail by layout, card creation where supported, card detail viewing, attachments, quiz, assignments, plant journal, DJ queue, vibe arcade.
- Parent: email magic-link login, child linking, child list, child activity/portfolio, child board list, board/detail viewing where the API supports it.

## Parity Criteria

- Brand: Aura-board app icon and wordmark appear consistently on login, home, and board shells.
- Layout language: warm neutral background, white surfaces, compact cards, 12px card radius or local token equivalent, blue primary action, restrained badges.
- Navigation: back/home/logout/link actions appear in predictable positions and do not strand the user.
- Content density: tablet landscape screens use web-like grids/columns rather than oversized single-column mobile-only layouts.
- Card interaction: tapping a card opens a detail view or modal. Link/file/video actions remain reachable from the detail view.
- Data truth: mobile parent screens must use production APIs, not mock boards.
- Failure states: loading, empty, expired-session, missing-data, and permission states match web copy tone and do not crash.

## Current Findings

- Student board detail was missing a card-detail modal for card-based layouts. A first pass now adds a native detail modal for freeform/grid/stream, columns, and read-only card layouts.
- Student plant journal could crash when plant roadmap data omitted `species`, `currentStage`, stages, or observations. A first pass now normalizes missing fields and shows a graceful empty state.
- Mobile board shell did not show the same Aura-board logo lockup as the web `Logo` component. A first pass now adds the app icon and wordmark.
- Parent child detail still uses mock board data and has a TODO instead of opening a board. This is the largest parent parity gap.
- Student and parent login screens still use an emoji brand mark instead of the app icon, so brand parity is incomplete beyond board detail.

## Implementation Plan

1. Stabilize the first student-board pass.
   - Review diffs from the frontend worker.
   - Ensure nested card link/file/video presses do not unintentionally open the modal.
   - Run `npm run typecheck` inside `apps/mobile`.

2. Bring shared mobile branding in line with web.
   - Add a small reusable mobile logo lockup component using `apps/mobile/assets/icon.png`.
   - Replace emoji brand rows in student login, parent login, and board shell.
   - Keep dimensions close to web logo usage: 28-32px in headers, larger only on login.

3. Fix parent data parity.
   - Replace `MOCK_BOARDS` in `apps/mobile/app/(parent)/child/[id].tsx` with a real parent-auth API call.
   - If an endpoint already exists, consume it. If not, implement a narrow API route returning child identity and board summaries.
   - Wire parent board taps to a real parent-safe board viewer or shared read-only board detail flow.

4. Audit student board layouts.
   - Compare mobile layout behavior against web for columns, read-only card boards, plant journal, DJ queue, quiz, assignment, and vibe arcade.
   - Fix only P0/P1 parity gaps: missing core action, crash, blocked navigation, broken empty/error state, or unusable tablet layout.

5. Audit parent flows.
   - Compare parent login, child linking, child home/list, child detail, and board viewing against web parent flows.
   - Fix P0/P1 gaps first, then polish copy/spacing where it is visibly inconsistent.

6. Verify and build.
   - Run `npm run typecheck` in `apps/mobile`.
   - Run targeted root checks if API/server files changed: `npm run typecheck`.
   - Start Expo locally for a smoke check when practical.
   - Upload an Expo/EAS build after checks pass.

## Orchestration Plan

- Frontend worker: bounded Expo UI changes in mobile route/component files.
- Backend worker: parent API contract or read-only parent board endpoint, only if missing.
- Frontend-audit worker: read-only audits by one route group or board layout at a time.
- Codex supervisor: owns plan, contract decisions, worker prompts, conflict resolution, final diff review, typecheck, and Expo build.

## Verification Checklist

- Student login accepts code and returns to board list after valid session.
- Student board cards open detail modal and close cleanly.
- Student card attachments open from the modal.
- Plant journal opens without crashing with missing or empty stage data.
- Parent login/link-child flow still typechecks and preserves session behavior.
- Parent child detail uses real data and board taps are not dead.
- No env or secret files are read or modified.
- Expo build is uploaded and build URL/status is reported.

## Security Note

Do not paste API keys into prompts, logs, or source files. If an external tool needs credentials, set them through the local environment or the provider's secret manager outside the repository.
