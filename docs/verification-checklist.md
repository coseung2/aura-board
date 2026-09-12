# Verification Checklist

Use this checklist as the single source of truth before calling a change done.
Pick the smallest checks that prove the user-facing behavior, then report
exactly what passed and what still has risk.

When adding project-specific verification guidance, update this file instead of
creating overlapping testing-notes documents.

## Local development startup and login

- 2026-09-08 KST song-guess design implementation: the approved teacher Aura
  styling and student B-layout/A-palette are now applied to web and Expo while
  preserving authoritative snapshots, real participant/pet scoreboards, import
  flow and answer privacy. Student screens use the round/time header, dark music
  player, four answer colors and selected/muted/reveal states; direct input and
  reconnect/error states use the same theme. Targeted UI/contract verification
  passed 4 files / 98 tests. Root/mobile TypeScript, mobile `design:check`, line
  limits, encoding/diff checks and the Next production build passed. The broader
  `npm run test -- SongGuess song-guess` run passed 317/319 tests; the two catalog
  server failures require the absent untracked local fixture
  `data/song-guess/clips/chopin-waltz-no19/highlight.wav` and are unrelated to
  the UI change. Android Expo JS/assets export passed with `--no-bytecode`
  (4,271 modules / 466 assets); this Linux environment could not execute the
  bundled Hermes compiler, so bytecode validation remains a Windows-runner check.
  Authenticated multi-client, visual comparison and physical Android/iPad checks
  are still required before rollout.
- 2026-09-08 KST design handoff: `docs/design/song-guess/README.md` and
  `figma-manifest.json` record the approved teacher design-system screens and
  student B-layout/A-palette screens. Figma has 7 teacher + 9 student screens,
  9 component families / 40 main variants, and 16 exported PNGs. Font and
  overflow checks passed. At handoff time these designs were not yet applied to
  the app; the implementation record above supersedes that status.
- 2026-09-08 KST pre-handoff checks: direct root/mobile TypeScript checks,
  song-guess Vitest (28 files / 319 tests), Rust workspace (68 tests), clippy,
  line limits, Python extractor/chart/playlist (11/7/4), and 20 Node ingestion
  tests passed. The Node FFmpeg integration was initially skipped; rerunning
  with FFmpeg exposed missing ffprobe (ENOENT). The npm typecheck prehook also
  hit a locked Prisma DLL (EPERM); direct tsc passed using the existing client.
  Neither a fresh production build nor authenticated UI acceptance was claimed
  for this design handoff. See the handoff document for continuation steps.

- 2026-09-08 KST source provenance: existing 20 classical catalog rows were
  classified as multi-track/highlight/uploader-highlight in the local manifest
  and production JSON metadata; exact provenance readback passed for all 20.
  The 18 new candidates remain timestamp-only with unknown completeness.
  The audit reports 576 legacy local entries as unclassified, not full recordings.
  `node --test scripts/song-guess-provenance.test.mjs scripts/song-guess-register-metadata.test.mjs scripts/song-guess-ingest.test.mjs`
  passed 11 tests; Python chart/playlist tests passed 7/4; catalog/catalog-server
  Vitest passed 12. A temporary SSH failure occurred before any DB update; retry
  succeeded, and temporary IP removal was verified. No new UI or deployment.

- 2026-09-08 KST classical catalog title correction: all 20 existing classical
  song IDs in `data/song-guess/catalog.json` now use short Korean titles.
  Production `SongGuessCatalogSong` title/aliases were updated and read back for
  all 20 IDs; old titles remain aliases and original titles remain metadata.
  Clip references and saved classroom packs were not modified. Targeted catalog
  and catalog-server tests passed (12 tests). Existing saved packs retain their
  copied titles; new packs use the corrected catalog names.

- Start with `infisical.exe run --env=dev -- npm run dev -- --port 3000`.
  Do not bypass `predev` with `npx next dev`: `dev:check` must verify a real
  database query and the login tables before Next starts.
- Infisical injection alone does not establish the SSH tunnel. The `aura_dev`
  database uses `127.0.0.1:15434`; establish an authorized OCI tunnel first,
  preserve host-key checking, and account for Bastion session expiry.
- If startup fails, restore the development connection and rerun
  `infisical.exe run --env=dev -- npm run dev:check`. Never switch to the
  production database or apply migrations there to make local login work.
- A landing page, anonymous session endpoint, or login page returning 200 does
  not prove login works. Verify the DB check and an authenticated page after
  login before reporting authenticated development ready. Do not copy OAuth
  callback URLs, credentials, or raw sensitive requests into diagnostic reports.
- Check feature-specific migrations separately before testing new DB-backed
  features. The startup check verifies connectivity and login tables only.
- 2026-09-08 KST: reproduced Google callback configuration failure with the
  development DB tunnel absent. Confirmed `dev:check` rejects that state and
  passes after restoring the tunnel to isolated `aura_dev`. Applied the four
  song-guess migrations dated `20260908090000` through `20260908160000` to that
  development DB and verified the new import table and round artist column.
  A fresh interactive Google login remains a separate user check.

## Baseline checks

- 2026-09-11 KST game rooms: student entry only provisions Omok/song-guess hubs;
  Kordle, speed-game and shadow-alliance require an existing teacher-opened hub.
  Song-guess now lists separate teacher/student sessions. Student room creation
  accepts catalog categories/segment/count only, derives its roster and classroom
  teacher on the server, and keeps answers and choice ordering private. The
  student host plays, starts and ends; classmates leave; the classroom teacher
  may end a student room. Only one unfinished student room per host/board is
  allowed. Existing teacher sessions retain the current-session contract.
  Both clients keep the selected session, confirm exit/end and retry failed
  commands without silently joining another room. Started student rounds advance
  under repository locks on reads/commands (30-second guessing, 5-second reveal);
  active clients poll every two seconds. With no readers, elapsed transitions are
  persisted on the next read, not by a background scheduler. Browser close/reload
  only gives the native exit warning and cannot guarantee a completed leave.
  Root suite passed 439 files / 2,653 tests, mobile 25 files / 145 tests, Rust 72
  tests; subsequent room API tests passed separately. Root/mobile TypeScript,
  mobile design, production Next build, line limits and diff checks passed. Verify actual PostgreSQL
  transactions, two students plus teacher, device back gestures/audio, and web
  layouts before rollout. Deploy the engine and matching web API before the app.

- Run `npm run check:lines` for source changes. Code, styles, tests, scripts,
  native modules, and generated source files must each stay at or below 800
  physical lines; split the owning generator when generated output exceeds the
  limit.
- Run `npm run typecheck` for TypeScript changes.
- Run targeted tests for changed logic when they exist.
- Run `npm run test` when the change touches shared logic or when targeted
  tests are not enough. If existing failures block it, report the failing files
  and why they are unrelated.
- For Prisma/schema changes, run `npx prisma validate` and `npx prisma generate`.
- For frontend visual changes, clear `.next` and restart `npm run dev` before
  browser checks when practical.

## Product Rollout And Private Payloads

- Test ordinary teachers, administrators, ordinary classrooms, pilot classrooms,
  anonymous requests, missing/legacy mobile capability caches and unknown layouts.
  A badge or a hidden menu never substitutes for a server guard and resource RBAC.
- Run `src/lib/product-release*.vitest.ts` and the actual game-hub/feed route
  tests. Protocol-only unit tests may isolate rollout, but real route allow/deny
  and policy-lookup failure tests must remain active (no global authorization mock).
- Verify both `/api/parent/signup` and `/parent/auth/callback` return 410 without
  database writes, cookies, session creation or login URLs, including with
  `PARENT_EMAIL_ENABLED=true`. Production QA test routes must return 404.
- Verify assignment peers have no submission text, attachments, feedback or
  duplicate private payload in `cards`; own data is outside shared board caches.
- Verify anonymous, foreign-classroom, wrong-board and peer draft/rejected Vibe
  access is denied. Authors/board managers may still inspect drafts.
- Exercise direct URLs, stored mobile feed tabs, push/deep-link entry and a
  normal account after logging out of a pilot account on a physical device.
- Deploy the server capability contract before the matching app update. Old
  installed apps may retain visible menus while the server correctly denies them.
- Run Android validation in GitHub Actions on the Windows runner, following
  [the Android build pipeline](mobile-android-build.md#github-actions-windows-validation).
  Confirm the workflow's `headSha`, Windows/x64 runner, Hermes bytecode step and
  APK/AAB verification all match. A `--no-bytecode` export checks JavaScript/assets
  only. Disposable CI signing is not production signing, an OTA publication, or
  physical-device validation.
- Retiring the magic-link endpoints does not revoke already-issued parent
  sessions. Investigate historical URL logs/session misuse operationally before
  deciding on targeted revocation; do not silently revoke all users.

## Seating redesign handoff — 2026-09-08 KST

- Teacher release (23:27 KST): classroom-home and top-navigation seating links
  are visible without administrator badges. Page and groups/layout APIs require
  a teacher session and ownership of the classroom, not an administrator email.
  Ordinary owners can read/save current seating and list/create/rename/delete
  their stored layouts. Anonymous and foreign-classroom access remain denied.
  Student/parent entry points and existing-board fallback policies are unchanged.
- Verification: 101 tests across 13 seating/navigation/API files passed; two
  further ordinary-owner PATCH/DELETE cases passed in a 16-case API rerun.
  TypeScript and line-limit checks passed. Live teacher login, persistence and
  production deployment must be verified separately from these mocked API tests.
- Current controls: save stays outside the drawer, status copy occupies existing
  space above the chalkboard, and the drawer portals to body above mega navigation.

- Updated 23:12 KST: tools use the DJ board's left-edge fixed drawer pattern,
  viewport-height internal scrolling and click-outside dismissal. Persistent
  icon buttons control sound, animation and skip; preferences survive reload.
  Countdown is a centered fixed number, with no in-flow reveal header.
  Chromium component fixture: chart bounds before/during shuffle both
  x=32,y=222,width=1216,height=224.9375; countdown centered at (640,360)
  for a 1280x720 viewport, drawer fixed height 720. TypeScript and 18 targeted
  tests passed. This is visual/component verification, not authenticated save QA.

- Seating reveal: click 자리 섞기 with motion enabled. Verify 3/2/1 countdown,
  covered shuffling cards, one-at-a-time names and completion; no draft update
  before completion, and skip/Escape applies the same result only once.
- Verify saved mute silences the first cue, mute stops current audio, and
  closing/unmounting clears timers/audio. Reduced-motion users retain immediate
  arrangement. Actual database application remains the separate 학급에 적용 action.
- 2026-09-08: reveal/editor tests 17 passed, TypeScript and line checks passed.
  Chromium fixture with fictional students verified normal completion, mobile
  mute/skip and successful playback of countdown/shuffle/reveal/completion OGGs.
  Real classroom persistence and physical-speaker volume were not tested.
  Kenney CC0 provenance is recorded in public/sounds/seating/SOURCE.md.

- Implemented the approved classroom + tools + saved-list layout inside
  `/classroom/[id]/groups`, without a second page header or instructional copy.
  Figma reference: https://www.figma.com/design/fJ8AmpdkWJ0srOerq8w8Bl?node-id=1-2.
- `classroom-seating-arrange.ts` applies fixed partners, visible adjacent
  desk pairs, and female:male ratio together. Each group's count and the class
  total may round only to floor/ceil of the requested ratio. Unsatisfiable
  conditions keep the previous arrangement; unassigned students stay excluded.
- `ClassroomSeatingEditor` supports drag, click and keyboard moves, including
  return from the unassigned tray. Changing rules or manually moving students
  clears stale arrangement status. Jua is loaded from Google Fonts with a
  sans-serif fallback.
- `ClassroomGroupsTab` separates applying the active classroom groups from
  named layout storage. A newly generated default arrangement can be applied.
  Restoring a snapshot changes the draft only. The library supports inline
  rename, rejects duplicate names with HTTP 409, and ignores stale list reads.
  Rename preserves the same administrator and classroom ownership checks.
  No schema migration is required.
- Passed: `npx tsc --noEmit`, `npm run check:lines`, and 52 tests across six
  seating/editor/library/groups/API test files:
  `npm run test -- src/components/classroom/__tests__/classroom-seating-arrange.vitest.ts src/components/classroom/__tests__/ClassroomSeatingEditor.vitest.tsx src/components/classroom/__tests__/SeatingLayoutLibrary.vitest.tsx src/components/classroom/__tests__/ClassroomGroupsTab.vitest.tsx src/app/api/classroom/[id]/seating-layouts`.
  The solver tests include exhaustive small-class identity permutations across
  pair modes, fixed partners, and 1:1, 2:1, 1:2, 0:1, 1:0 ratios.
- Browser verification used real components and styles with a temporary
  in-memory API and fictional students. Checked desktop and 390px width,
  mixed pairs plus fixed partners, 2:1 rejection for a 12F/12M class without
  changing seats, named storage, rename, apply and reload. This is not proof
  of real database persistence or an authenticated Next.js page.
- Remaining on the next computer: restore the authorized development SSH
  tunnel to port 15434; run `infisical.exe run --env=dev -- npm run dev:check`
  and then start development through Infisical. Verify the actual admin-owned
  groups page, POST storage / PATCH rename / DELETE and PUT active apply,
  persisted database state and reload, plus the new-board grouping snapshot.
  Preserve the existing access guards and unrelated work.
- The local DB preflight failed because that tunnel was absent. The
  `npm run typecheck` Prisma prehook also hit a Windows engine DLL lock from
  an existing process; direct TypeScript checking passed. Authenticated DB
  roundtrip, production build and deployment were not verified in this pass.

## Save And Publish Flows

- Do not treat optimistic UI as proof that a save worked.
- For any save, publish, distribute, reminder, or PATCH-style mutation, verify
  the full round trip: user action -> successful response -> persisted
  database/server state -> page reload still shows the saved state.
- When the feature affects another role or surface, verify the downstream
  surface too. Example: teacher distributes an assignment from a columns board,
  then the teacher board still shows it after refresh and the student dashboard
  shows the assignment/submission status.
- For database-backed UI state, check before/after persistence directly when
  practical. A passing typecheck or changed local React state is not enough.
- PATCH handlers should build update payloads from explicitly provided fields.
  Avoid broad `...input` updates when optional fields, nullable fields, or
  unrelated feature state share the same route.

## Production Issues

- Confirm the deployed commit contains the fix.
- Confirm migrations are applied or explicitly not needed.
- Check runtime logs for the failing route or status code.
- Inspect production data shape when the symptom is data-dependent.
- Re-test the exact route, board, classroom, or student flow named by the user.

### Student QR login behind Oracle nginx

- Simulate the standalone request URL as `http://localhost:3000/qr/<token>` with
  `X-Forwarded-Proto: https` and `X-Forwarded-Host: aura-board.com`; confirm the
  response is `302` with `Location: https://aura-board.com/student` (or the
  accepted safe internal `next` path), never a loopback URL.
- Confirm an invalid QR token redirects to
  `https://aura-board.com/qr/invalid`, and external, protocol-relative, login,
  and API `next` targets still fall back to `/student`.
- Confirm direct local development requests retain their local HTTP origin,
  while printable QR cards refuse a loopback origin and allow a LAN origin for
  physical-device testing.
- After deployment, scan one current student QR on a physical device and verify
  the browser remains on `https://aura-board.com`, the student session is set,
  and `/student` loads without another login prompt.

### Canva card thumbnails

- Test the design-page `media.canva.com ... page=1` path, the oEmbed
  `/screen?type=thumbnail` redirect path, and the no-thumbnail fallback as
  separate contracts. Do not classify `/screen` from its pathname alone.
- Keep upstream thumbnail URLs restricted to HTTPS Canva hosts and stream only
  a final `image/*` response. A Canva-external oEmbed URL must remain rejected.
- In production, verify a representative public design returns `200 image/*`
  from `/api/canva/thumbnail` and
  `X-Canva-Thumbnail-Source: resolved` from
  `/api/canva/card-thumbnail`. An image element with non-zero dimensions is not
  sufficient because the fallback SVG is also a successful 640x360 image.
- Verify the direct thumbnail route and the card-thumbnail wrapper separately.
  The wrapper must not depend on a public-origin self-fetch; Oracle standalone
  loopback, nginx, Cloudflare, and Vercel can otherwise produce different
  results for identical application code.
- On native mobile, never pass a web-relative preview URL such as
  `/api/canva/thumbnail?...` directly to `expo-image` or `Image.prefetch`.
  Confirm the shared media normalizer resolves Aura Board-owned paths against
  the mobile API base, and that prefetch and render receive the same absolute
  URL.
- On a physical mobile device with an empty image cache, open a board that has
  a Canva design and confirm its thumbnail is visible before opening the Canva
  WebView. Then open the design, navigate back, and confirm the thumbnail is
  still immediately visible from the normal image path.
- Repeat the mobile check with a legacy Canva card whose `linkImage` is null and
  with a link attachment whose `previewUrl` is relative. A valid Canva design
  URL must be sufficient to derive the stable Aura Board thumbnail proxy URL;
  repairing or re-saving the card must not be required.

### Teacher content library and Canva PDF export


- Add a columns-board section containing an aura-board-hosted image, an external
  image, and a Canva design. Confirm the aura-board image keeps its existing object
  URL, the external image is copied once into teacher-library storage, and the
  Canva item stores only its design identity and display metadata.
- Delete the source card and run blob cleanup after its delay. Confirm an aura-board
  image referenced by a library item remains. Delete the final library item and
  confirm the object becomes eligible for cleanup.
- Select two or more library items and confirm the browser starts exactly one
  PDF download in the builder order. Canva pages retain source dimensions and
  image pages are fitted to A4 without cropping.
- Disconnect Canva and confirm saved Canva entries remain visible but export is
  blocked with a reconnect action. Reconnect, refresh, and confirm export works.
- Verify the server rejects duplicate IDs, more than 20 items, and any item not
  owned by the authenticated teacher. Any failed Canva or image download must
  fail the whole request; never return a silently incomplete PDF.

### Scheduled Job Changes

- Parse the workflow syntax and verify the exact endpoint method/path mapping.
- Keep `schedule` absent before an explicitly approved cutover.
- Confirm secrets and response bodies cannot appear in logs or step summaries.
- Verify retries and endpoint behavior are idempotent before enabling a schedule.
- Call a production endpoint only after explicit approval; use dry-run verification otherwise.

### Oracle Production Deployment

- Parse `.github/workflows/deploy-oracle.yml`, run `bash -n` for every changed Oracle shell script, and validate the installed sudoers file with `visudo -cf` on Linux.
- Confirm `/etc/aura-board/build.env` contains no production credentials, is `root:aura-app` mode `0640`, and the repository build never reads `/etc/aura-board/app.env`.
- Confirm the runner is repository-scoped, online, ARM64, and labeled `aura-board-prod`; never run pull-request code on the production runner.
- Trigger the first release with `workflow_dispatch`. Confirm the workflow SHA, `/opt/aura-board-app/current`, and `/opt/aura-board-play-engine/current` all resolve to the same commit.
- Confirm the play-engine, Next.js, and nginx loopback health checks pass after restart, then verify the public production health endpoint and the exact changed user flow.
- Exercise rollback with a disposable failing release before treating push deployment as operational. Confirm both symlinks and both services return to the same prior release.
- Confirm completed release trees are root-owned, contain matching completion/checksum markers, and have no group/world-writable files or directories.

## Oracle Self-hosted Supabase Staging

These checks are staging evidence only. They do not authorize production endpoint, DNS, application env, or source-of-truth cutover.

- [x] Restore managed `public` schema/data and core Storage metadata, then verify representative row counts, 18 public RLS policies, PostgREST service-role read, and share-token allowed/denied behavior.
- [x] Join Realtime, receive a real `postgres_changes` event, and complete an actual Broadcast publish/subscribe round trip.
- [x] Configure the private/versioned OCI S3-compatible bucket and recreate the Storage container with HTTPS/path-style S3 settings. Verify container health and a direct put/get/delete probe without logging credentials.
- [x] Migrate exactly 1,226 payload objects totaling 1,040,594,444 bytes. Confirm OCI object count/bytes match, no probe objects remain, direct S3 SHA-256 samples pass 8/8, and self-hosted Storage API downloads match managed source SHA-256 8/8.
- [x] Inventory persisted managed Storage URLs across 11 columns and 1,173 rows. Record `supabase.aura-board.com` plus gradual backfill as the selected stable endpoint strategy.
- [x] Expose `supabase.aura-board.com` through Oracle nginx/TLS and a proxied Cloudflare A record. Auth/REST reject unauthenticated requests with `401`, Storage status returns `200`, and Auth/Storage containers are healthy. Representative private/signed download and persisted-URL checks remain part of the final app-env cutover smoke.
- [x] Sync the existing S3 backend configuration and Customer Secret values from the root-owned mode `0600` A1 env into Infisical `prod` `/oracle/aura-board/supabase-storage` without printing values; all eight expected keys were compared exactly and temporary transfer files were removed.
- [x] Create/reuse a Bastion session through the runner identity, write ACTIVE metadata, complete local SSH port forwarding to the A1 `ubuntu` account, replace public `0.0.0.0/0:22` with target-subnet TCP/22, and verify external TCP/22 is closed while Bastion SSH and public HTTPS health remain successful.

## Supabase Free + Vercel Warm Standby DR

Oracle Osaka is the production primary and source of truth for this DR scope. Supabase Free and Vercel are a warm standby path, not active-active production. The operational scope and evidence handoff are in [`docs/infrastructure-handoff.md`](infrastructure-handoff.md) and the design constraints are in [`docs/supabase-selfhost-dr.md`](supabase-selfhost-dr.md).

Do not mark any item below complete from a staging-only observation. Record the target project/endpoint, UTC timestamp, deployment or commit SHA, and sanitized SQL/log artifact for every result; never record secret values.

### Promotion control

- [ ] Confirm the runbook requires an operator-approved primary write fence or confirmed Oracle unavailability before promotion. Record the approver, incident ID, fence result, last replicated LSN/heartbeat, and promotion time.
- [ ] Confirm Oracle and DR cannot remain writable at the same time during failover, preventing split-brain. Automatic timeout-only promotion and automatic DNS switching must be disabled or explicitly guarded by the fence.

### Data and service parity

- [x] Compare primary and Supabase Free migration history plus current publication data: after applying four missing schema migrations on 2026-08-30, source/DR migration history was 146/146 and all 176 publication table row counts matched exactly with zero mismatches. The earlier catalog/RLS/Realtime evidence remains in the 2026-08-20 handoff.
- [x] Verify logical replication publisher/subscriber state: current `postgres` slot `aura_board_oracle_dr_slot_v2` active, 176/176 subscription relations `ready`, apply errors 0, and the private heartbeat fresh. The single retained sync-error counter is the pre-recovery missing-grant failure recorded in the incident.
- [x] Exercise DR PostgREST: service-role `200`/1 row; anonymous no token `200`/0; valid share token `200`/1; invalid token `200`/0.
- [x] Join DR Realtime and verify Broadcast plus Oracle-origin `postgres_changes`; the canary update was received in 1.134 seconds.
- [x] Create a dedicated `aura-board-dr` Vercel project in the approved team, apply the Next.js framework preset, and verify it has no production env or deployment before Supabase DR is connected.
- [x] Verify Vercel DR deployment `dpl_CiNbYJYtybN5GuCTef7FXYwVfAfv` is production `READY`; after database credential rotation and Sensitive env update, alias `/api/health` returned `200`, database reachable, replication fresh. Previous media-degraded and auth-first upload evidence remains valid.
- [x] Enable `.github/workflows/dr-watchdog.yml` with `AURA_DR_HEALTH_URL` and, only for a protected endpoint, `VERCEL_DR_PROTECTION_BYPASS`. The 15-minute schedule remains fail-closed without automatic promotion or provider mutation; recovery runs `33288417948` and `33288982785` were green.

### Traffic switch and recovery rehearsal

- [ ] Perform an approved Cloudflare origin switch rehearsal and retain before/after DNS record, proxy/TTL, audit/change, external HTTPS response, and rollback-to-Oracle evidence. Confirm traffic is not split between Oracle and Vercel DR.
- [ ] Run a failover smoke after fencing and promotion: verify login, shared-board access, representative CRUD persistence, RLS isolation, Realtime delivery/reconnect, and the documented rollback trigger. Record timestamps, canary identifiers, status codes, and observed lag.
- [ ] Run a failback rehearsal with DR as the temporary source of truth: cleanly resync/restore to Oracle, freeze writes, apply the final delta, switch Cloudflare back, and verify schema/RLS, health, CRUD, Realtime, elapsed time, and restoration of the Supabase Free warm standby.

### Object availability acceptance gate

Object payload replication or a documented media degraded-mode is a separate gate from DB/API DR. Do not accept the full DR path because schema, PostgREST, Realtime, or Vercel checks pass alone.

- [x] Select and verify degraded mode: current payload is 1,226 objects / 1,040,594,444 bytes with one 78,591,142-byte object, exceeding Supabase Free 1 GB total and 50 MB single-file limits. DB/text/board paths remain supported; uploads, deletes, and private downloads are rejected before Storage I/O with a persistent recovery notice. Existing image/file public URLs may be unavailable while Osaka is down. Keep Cloudflare Stream video outside this gate.

## Always-open Game Hub

- Render the teacher dashboard 놀이 tab and confirm it shows 잼라이브 plus exactly Shadow Alliance, Kordle, Speed Game, Omok, and Song Guess as one consistent six-card grid. Game cards keep a fixed `14rem` width; responsive layouts change only how many cards fit per row and must not stretch cards to fill the row. Confirm the teacher opens an official game through a classroom-selection modal when multiple owned classrooms exist, skips the modal when only one classroom exists, lands in the same classroom-owned room students enter, no longer sees the dashboard classroom selector or 학급 관리/배경 설정 controls on the board hub, and no teacher-authored legacy official-game board appears in the dashboard or top navigation.
- Inspect `20260806205500_remove_legacy_official_game_rooms/migration.sql` and confirm it deletes only official-layout boards whose `systemGameKind` is null. Apply it only in an approved environment, then verify normal quiz, DJ queue, columns, and stream boards remain.
- Render the web student board hub and confirm its primary segmented control matches the teacher board control with exactly 수업, 놀이, and 전적; there is no board search, 전체 button, or nested 놀이/전적 tab row. With zero teacher-created boards, confirm 놀이 still shows 잼라이브 plus exactly Shadow Alliance, Kordle, Speed Game, Omok, and Song Guess as one consistent six-card grid. The five official games retain unique generated raster art, one-line descriptions, live status, and one obvious entry action each; 잼라이브 retains its direct entry route in the same card hierarchy.
- Run `src/lib/game-platform/contracts.vitest.ts`, `src/lib/game-platform/hub-room.vitest.ts`, `src/app/api/student/game-hub/entry/route.vitest.ts`, `src/components/StudentDashboard.vitest.tsx`, and `src/app/api/student/game-records/route.vitest.ts`. Confirm web/mobile catalog parity, five unique artwork keys, canonical room reuse/race handling, strict rejection of client score/timing claims, zero-board rendering, and reachable record filters.
- Confirm `/api/student/boards` and the student-home loader exclude rows with `systemGameKind`, while direct game entry can still fetch the canonical room detail.
- Inspect `20260802160000_game_ui_platform/migration.sql` and confirm `Board.systemGameKind` is null for normal boards, equals an official PLAY layout when present, requires a classroom, and is unique by `(classroomId, systemGameKind)`. Do not apply the migration outside disposable/staging approval.
- Enter the same game concurrently from web and Expo for one classroom and confirm both clients receive the same room. Enter from another classroom and confirm a different room. Confirm the classroom teacher is the server-created owner and the client cannot choose the teacher, classroom, room ID, score, duration, participant, or host.
- Run the root production build and `npx expo export --platform android`. Confirm all five production assets exist under `public/game-hub/*.png` and both web and Expo resolve those same static URLs without a placeholder or `.ai-bridge` runtime dependency.
- At phone, Galaxy Tab portrait, Galaxy Tab landscape, and desktop widths, confirm no clipped cards, overlapping status/action controls, or nested generic board-card metadata. Verify keyboard focus, screen-reader names, 44px touch targets, reduced motion, loading, retry, missing-setup, and safe back-to-hub behavior.

## Teacher classroom navigation

- Open the teacher `학급` mega menu and confirm its groups are `학급 선택`, the selected classroom's `관리`, `학급 운영`, and `활동·기록`. `학급 운영` contains only `1인1역`, `과제 현황`, and `은행`; `청소·당번`, `제출 체크`, `QR결제`, and `매점` are absent. Confirm `자리·모둠` is absent for a normal teacher and appears only for an administrator with an `관리자` badge. Confirm `1인1역` opens `/classroom/:id/roles`; the misleading `1인1역할` group is absent.
- Open the classroom dashboard and confirm the read-only KPI row is followed by the grouped `학급 기능` card grid. Feature cards follow the assignments-page language: a tinted head bar with the metric and title, plus a thin supporting line, with no boxed surface, decorative emoji, or arrow. The walking card metric is the classroom student total for today, labeled `학급 합계`, not a teacher step count. The grid uses four columns on wide screens, two columns at the intermediate breakpoint, and one column on mobile. A normal teacher sees students, boards, parent access, roles, assignments, bank, portfolio, reading, walking, and daily banners; `자리·모둠` is hidden. An administrator additionally sees `자리·모둠` with an `관리자` badge. `청소·당번`, `제출 체크`, `QR결제`, and `매점` remain absent.
- Open `/roles`, `/morning`, and `/assignments` as the owning teacher and confirm each page renders only its named task. Verify another teacher receives the existing not-found boundary.
- Assign the checker, cleaning-inspector, and store-clerk roles to students and confirm `내 역할` opens their dedicated check, cleaning, and store-payment pages. Confirm those execution pages reject a teacher-only session, while the store clerk can still reach product management from the payment page. Keep the digital store routes and data until a current production usage audit confirms there are no active customers; the offline `매점` role label and assignment must remain either way.
- Open walking, daily-banner, and reading pages and confirm each uses its own page title without cross-feature navigation tabs. The walking title and teacher navigation label are `걷기`; the connected count uses each student's full synchronization history while today/recent-seven-day metrics remain date-bounded. On reading, the summary row keeps student, book, author, generated numeric score, date, and management columns; unevaluated scores render as `—`. Each record starts collapsed and expands into full-width second and third rows for the student's reading record and AI evaluation. On the teacher reading list, the disclosure chevron, student name, and delete label share one cap-height box; the delete control keeps a 44px hit area without a taller visible chrome box. Preserve the finance page's `입출금 / 거래 기록` view switch because it changes views within one task.
- Leave a reading log pending for more than two minutes and confirm the Oracle `reading-feedback` cron claims it, stores a generated score and feedback, and leaves newer revisions untouched. Confirm each invocation processes at most one record and a stale `processing` record is recoverable.

## Authoritative Multiplayer Play

### Static and automated checks

- Run `cargo fmt --manifest-path services/play-engine/Cargo.toml --all -- --check`.
- Run `cargo clippy --manifest-path services/play-engine/Cargo.toml --workspace --all-targets -- -D warnings`.
- Run `cargo test --manifest-path services/play-engine/Cargo.toml --workspace` and confirm coverage for actor-to-slot binding, two-party ready plus host start, stale expected version, exact duplicate replay before version checking, request-ID reuse with a changed payload, terminal results, rematch slot swap, and outbox versions.
- Run the targeted Vitest files for the play wire contract and migration, then `npm run typecheck`.
- Run `npm run typecheck` and `npm run design:check` in `apps/mobile`.
- Run `npx prisma validate` and `npx prisma generate`; inspect the generated migration SQL for the current-session partial unique index, participant slot uniqueness, durable request receipt uniqueness, safe-integer checks, RLS, and revoked browser-role grants.
- Confirm the canonical JSON schema versions match Rust and TypeScript constants.

### Song-guess browser ingestion and play checks

- Teacher timed links: run import-link/import-server/import-worker and SongGuessImportPanel tests. Verify teachers cannot query or materialize another board's imports; students are rejected before DB/audio work. Stale workers must not overwrite a newer lease, and only ready hash-verified audio may be added to a draft. Repeated same-board links reuse the same job. Saving or deleting the round pack must not remove the reusable import source.
- 2026-09-08 implementation verification: full Vitest 427 files / 2,538 tests passed; extractor Python 11 tests passed with FFmpeg on PATH; playlist credit normalization 4 tests and metadata matcher 3 tests passed. Typecheck, Prisma validate, line-limit, diff-check and production build passed; standalone includes the extractor. Actual YouTube video `1uDzUPzS2w8` at45s produced exact15s/1,323,044byte WAV. No teacher-import migration, app deployment, cron activation or authenticated two-classroom production test has run yet. Independent worker implemented the bounded parser/extractor and boundary tests using inherited model routing; primary integrated and fixed the detected retry-quota and lost-acknowledgement cleanup defects.
- Apply teacher-import migration, install pinned Python dependencies/FFmpeg, verify standalone extractor inclusion, and enable Oracle recovery cron before production acceptance. Check `t=45` and `t=0`, wrong hosts, too-short/private videos, retries and reload. Test teacher correction of missing title/artist; no composer is required for K-pop.

- Select title, artist/composer, or artist + title independently of text/multiple-choice. Verify server-created answers and automatic distractors use the same target, repeated artists do not duplicate options, and a title-only submission cannot answer an artist or combined question. Restore sessions and verify the target remains available to web/mobile; legacy sessions default to title and old create-request hashes remain compatible.
- Apply `20260908120000_song_guess_round_artist` before releasing artist-target support. Catalog preparation and manual pack save/reload must preserve artist/composer metadata. Legacy missing artists may resolve only from an unambiguous catalog match; ambiguous titles require an explicit artist. No title aliases become artist aliases. Combined answers use `가수·작곡가 - 노래 제목`, including qualified title aliases.
- 2026-09-08 target checks: full Vitest 423 files / 2410 tests passed; four additional mobile target cases passed in a 66-test isolated run. Rust workspace 68 tests and clippy passed. Root/mobile typechecks, mobile design check, line limits and diff checks passed. Prisma schema generation/validation passed (validation used disposable localhost URL values without connecting). The artist-column migration has not been applied to a live database; authenticated save/reload and physical-device acceptance remain deployment checks.
- Create games in both 서술형 and 객관식 (4지선다) modes. Reload each persisted session and verify its mode, stable current-round options, and the student's submitted choice. Legacy sessions without a mode remain text games. Multiple-choice games must contain exactly four distinct labels with opaque IDs; never expose correctness metadata, other students' selections, or future-round options.
- In multiple-choice mode, test correct and wrong selections, invalid IDs, free-text bypasses, duplicate requests, a second selection after a wrong answer, expired deadlines, and stale round IDs. The server must enforce one submission per participant per round. Check the four buttons at 390px and desktop widths, keyboard access, submission locking, and reset on the next round on web and mobile. Reject creation clearly if three unambiguous distractors cannot be generated.
- 2026-09-08 answer-mode validation: `npm run test -- SongGuess song-guess` passed 23 files / 178 tests; Rust workspace passed 67 tests plus fmt/clippy. Root/mobile typechecks, mobile design checks, line limits and diff checks passed. Earlier full Vitest passed 421 files / 2370 tests before the last targeted additions. The `.codex/artifacts/song-guess-ui/preview-choices.mjs` fixture verified real web components at 390px and 1440px, selected-choice locking and legacy text input. Storage serialization/replay tests passed; authenticated multi-client play, actual PostgreSQL restart, physical devices and production deployment remain unverified.
- Automatic choices now use the full catalog's title/alias metadata plus the selected pack. A single selected song must produce one question with its answer and three distinct distractors; never require the teacher to select extra questions. Exclude normalized duplicate titles and alias overlap, including a candidate whose aliases match the correct title. Text mode must not query the catalog. Follow-up choices/server/board tests passed 29 tests; catalog metadata does not require downloading distractor audio.
- For new v2 games, verify one exact 15-second clip per round, category selection (including empty selection = all), intro/highlight filtering, and a persisted setup reload before creating a session. A missing segment must exclude that song; never substitute another segment silently.
- Run the catalog, DB, sync, route, and pool picker tests plus `node --test scripts/song-guess-import.test.mjs scripts/song-guess-import-youtube.test.mjs`. Verify exact FFmpeg output, manifest preservation, short-source rejection, and partial upload cleanup. Runtime catalog reads must use the DB and private storage; standalone releases do not need to bundle the source manifest or local audio pool.
- Apply the 15-second asset constraint migration before deploying v2. Check that web and play-engine processes use the same DB target and an actual current-session query succeeds; `/health` alone does not verify storage.
- In v2, start a round and submit correct guesses at different server times: earlier submissions earn more, the deadline is 30 seconds, and submissions at/after the deadline earn zero. Retry an acknowledged request and confirm its original score; a delayed request for an older round must fail. Repeat across web and mobile, including background/resume.
- Open the lobby on a teacher screen and enter from two authenticated students through the existing play-board list at the same snapshot version. Opening the board automatically sends one `join` command; no QR, invite link, or second entry button is shown. Both commands must succeed and survive reload. Only acknowledged entrants appear in the pet grid. Start requires at least one entrant, absent roster members do not block it, and an unjoined student cannot guess. Legacy v1/restored sessions retain their existing participants. Verify auto-entry and pending-command recovery never send the same in-flight request twice.
- After each reveal, verify the central top-five scoreboard includes representative pets, names, the server-awarded round gain, total points, and movement from the prior round. Expand remaining participants. Ties share a rank (1, 1, 3), duplicate names retain their own pets, and unjoined roster members are excluded. Reload and compare the same round gains/ranks; they must not depend on client memory.
- Finish with zero, one, two, and many entrants. Verify the final podium uses the actual top three participants, displays second/first/third from left to right, and includes the full final ranking. Check long Korean names and missing pets at 390px and 320px widths, as well as reduced-motion mode.
- Run `SongGuessBoard`, `SongGuessPlayer`, `SongGuessScoreboard`, participant-identity, catalog/server, and sounds tests. Verify the private audio file begins only after a gesture, stops on unmount/background, and does not overlap a cue. Check join/start/correct/wrong/countdown/round-results/podium sounds, mute, and background/resume. The Kenney sound license and attribution ship in `public/sounds/song-guess/`.
- Verify only validated file-backed or private-storage-backed catalog segments contribute to playable counts or selection. Metadata-only rows remain registered separately. Prepare a real classical catalog clip through private download, hash/size validation, and board-owned asset creation. Verify all metadata categories are retained and participants cannot query the answer catalog or public storage URLs. Neither game screen should create an iframe, request an embed endpoint, or load a video SDK. Legacy video-only rounds show a missing-audio error and are rejected when creating a game.
- The local `.codex/artifacts/song-guess-ui/preview-game.mjs` fixture renders production UI components with in-memory participants and a synthetic tone. Its visual/audio checks do not prove authenticated multi-client synchronization, database persistence, real YouTube availability, or physical Android/iPad behavior; perform those acceptance checks separately before rollout.
- The following short-clip checks cover legacy v1 compatibility; new uploads additionally verify 661,500 mono samples for the 15-second clip and no padding.
- Run `src/lib/song-guess/audio.vitest.ts` and confirm exact 44-byte WAV headers, 22,050 / 44,100 / 66,150 mono sample counts, selected-start slicing, stereo downmix, resampling, exact-end acceptance, and no-padding rejection.
- Run `src/lib/song-guess/teacher-workflow.vitest.ts` and confirm rights confirmation is mandatory, the upload dependency receives only three `audio/wav` derivative blobs, the ordered setup payload contains only opaque asset IDs, and partial upload/setup-save failures clean successful unassigned assets.
- Run `src/components/SongGuessBoard.vitest.tsx` and confirm a current session locks teacher editing, student HTML contains only the current clip URL and no teacher answer, server-returned score feedback is rendered, and an unacknowledged command reuses the exact stored request.
- Run `npm run test:song-guess:browser` to bundle the production audio utility in memory, create a 48 kHz stereo synthetic tone in Headless Chrome, generate all three derivatives, verify exact WAV headers/byte lengths, create and revoke object URLs, and browser-decode 0.5/1.0/1.5-second mono clips without autoplay.
- In an authenticated browser, select a local tone or music file, move the start slider and number input, explicitly preview the 1.5-second source, generate and play all three local derivatives, then save. Inspect Network and confirm no request body contains the original filename, original byte length, original MIME, local path, or full source.
- Confirm every generated local object URL is revoked after replacement, deletion, successful save, or unmount; confirm source preview nodes stop and the `AudioContext` closes on unmount.
- Force the second or third derivative upload to fail. Confirm successful assets from that attempt receive authorized `DELETE` cleanup requests and retry starts from the locally generated blobs without uploading the source.
- Force setup save to fail after all three uploads. Confirm cleanup deletes only unassigned assets; assigned assets return a conflict and remain attached to the committed setup after a lost response.
- Create a session and verify `draft -> lobby -> guessing -> reveal -> next_round/finished`. Confirm only the host can advance phases, only participants can guess, 0.5/1.0/1.5-second clips unlock in order, and score awards come only from Rust command results.
- Inspect participant snapshots and page HTML in every phase. Representative answers, aliases, normalized forms, private object keys, source metadata, and future clip IDs must never appear.
- Run `src/lib/__tests__/mobile-song-guess-contract.vitest.ts`, mobile typecheck/design checks, and `npx expo export --platform android --clear`. Confirm the Expo student board renders the native song-guess layout, fetches only the authorized current snapshot, and cannot roll back or cross sessions.
- On a physical Android device with an authenticated student and active staging session, confirm private clips load through `expo-audio` with the student bearer header, replay from the beginning after completion, pause correctly, and switch cleanly across 0.5/1.0/1.5-second unlocks. Submit with the keyboard open, reload after the server response, and verify the same score and revealed answer on web and mobile.
- Inspect unassigned `SongGuessAsset` age/count in staging. The interactive flow should clean normal failures; define an operator-owned age sweep before production to cover a tab closing between upload and setup save.

#### Local verification, 2026-09-08 (KST)

- Teacher answer guide: after preparing questions and after creating a session, open/close `교사용 정답 목록`; verify ordered representative answers, accepted aliases, current-round marker and grading guidance. Opening must not send a reveal command. Student views must neither request teacher setup nor render this control or its answers.
- Background refresh: hold a current-session GET pending while a student types. The header must retain its geometry without a transient loading badge; the answer remains enabled, focused and unchanged. Server version-conflict recovery remains authoritative for a simultaneous command.

- Continued the song-guess work from Codex session `01a07e3c-d2aa-71c3-b75c-76e306be0df8`.
- Root `npm run typecheck` and `npm run build` passed after the audio-only correction. The built route manifest has no song-guess playback/embed route. The later DB catalog verification below supersedes the initial three-file local pool.
- Initial UI continuation `npm run test -- SongGuess song-guess`: 19 files / 90 tests passed, including native audio replay/error/visibility handling and a single automatic join on board entry. Failed joins retain a retry action after state refresh; 403/429 cases cover repeated rejection then successful manual retry without an automatic request loop. Earlier full `npm run test`: 419 files passed; one existing registry-writer test exceeded its 5-second timeout while the build ran concurrently (2318 tests passed). Its file passed all 4 tests on isolated rerun in 1.29 seconds. No registry-writer source was changed to hide the timeout.
- `node --test scripts/song-guess-import.test.mjs`: 8 passed, 1 real FFmpeg extraction check skipped because the FFmpeg/ffprobe pair was unavailable on PATH. Mocked importer tests cover Windows paths, remote URL rejection, mixed YouTube/local catalogs, incremental segment preservation, exact output, and failure rollback.
- Play-engine workspace tests: 62 passed. Workspace `cargo fmt -- --check` and `cargo clippy --all-targets -- -D warnings` passed.
- Mobile typecheck, design check, slime assets check, and Android Expo JS/assets export passed. The final export includes audio-only playback, automatic entry, and failed-join recovery: `.codex/artifacts/song-guess-ui/mobile-android` (4268 modules, 466 assets, 8.24 MB Hermes bundle). Mobile contract tests passed 8/8. This is not an installed native build.
- Browser fixture checks covered automatic student entry acknowledgement without QR/link/extra join controls, local tone play/replay through an audio element with no iframe/video script, answer feedback and duplicate-submit disabling, round gain/rank movement, final pet podium, long names, and no horizontal overflow at 390px/320px. This fixture uses production components with synthetic audio and in-memory state; it does not verify authentication or two-client server synchronization.
- `npm run check:lines`, `npm run check:encoding`, and `git diff --check` passed. Authenticated two-client staging acceptance, physical Android/iPad checks, and production deployment were not performed in this continuation.

### Staging database and service checks

#### Production catalog registration, 2026-09-08 11:20 KST

- Applied only the song-guess highlight and catalog migrations to the verified Oracle production database. Registered all 596 metadata records and 996 private clips; all 596 songs are playable, including all 20 supplied classical tracks. Category counts and source provenance are in `docs/song-guess-catalog.md`.
- Read back every metadata record with zero mismatches. Downloaded all 996 private objects and verified DB hash/size, PCM16 mono 44.1 kHz format, and exactly 661,500 samples; zero failures. Anonymous catalog access returned 401 and public object access returned 400. Evidence: `.codex/artifacts/song-guess-production-verification.jsonl`.
- A second import preserved 668 matching objects without uploading them again. The local final dry run reports 596 metadata rows, 596 playable songs, 996 valid clips, zero pending songs, and zero missing files.
- `npm run test -- media-storage SongGuess song-guess`: 23 files / 103 tests passed. After the final metadata-only test expectation was removed, its catalog file passed 8/8. `python scripts/song-guess-download-pool.test.py`: 4/4 passed, covering partial caches, executable discovery, path traversal, and rejection of short audio without padding.
- Final `npm run typecheck` and `npx next build` passed. The catalog route's output trace contains zero local catalog/audio files: runtime uses the DB and private storage. Line limits, changed-text encoding, and `git diff --check` passed.
- Database/storage changes are live. App/play-engine source changes were not deployed in this continuation; authenticated multi-client acceptance and physical mobile playback on that version remain unverified.

#### Staging acceptance

- Use a disposable or staging Postgres database only. Apply the migration and confirm `PlaySession`, `PlayParticipant`, `PlayRequestReceipt`, and `PlayOutbox` exist.
- Confirm `anon` and `authenticated` cannot select, insert, update, or delete any authoritative play table.
- Confirm the private Rust database role can transact against all four tables.
- Start Axum with private staging configuration and verify `/health` only through the intended private network path.
- Verify Next rejects a missing, expired, or tampered actor assertion and never accepts a client-supplied actor subject or slot.
- Verify a teacher can create an Omok session only from two students in the board classroom; a student outside that classroom and a non-member teacher receive `403`.

### Lifecycle and recovery matrix

- For the Omok realtime implementation and rollout order, use
  `docs/omok-realtime-commercialization-plan.md`. Record local feedback,
  server commit/ack, and peer render as separate timings; a fast pending stone
  does not prove persistence or peer propagation.
- Obtain a short-lived realtime ticket only after normal Next authentication.
  Verify anonymous, non-member, wrong-session, expired, tampered and replayed-to-
  another-session tickets fail, and verify the client URL/logs never contain the
  ticket, actor subject, student ID or shared secret.
- Verify the React Native client sends the fixed Origin
  `https://mobile.aura-board.invalid`, Rust accepts it only when it is explicitly
  present in `PLAY_ENGINE_REALTIME_ALLOWED_ORIGINS`, and an empty allowlist keeps
  `/v1/realtime` fail-closed without disabling the HTTP play routes. Force six
  consecutive pre-ready failures and confirm the client enters HTTP-only
  degraded mode with no reconnect timer; foregrounding or resetting the session
  must open a fresh bounded retry cycle.
- Connect S23 `R3CW50BW8KB` and A20 `R59M904MEMY` to one Omok session. Play
  black → white → black → white in both directions and record p50/p95 for touch
  to pending, engine commit/ack and peer render. Target p95 is at most 100ms,
  500ms and 1s respectively; normal server approval must not exceed 1s.
- Verify the pending stone is visually distinct from the last committed move,
  appears within 100ms of the separate move-confirm action, blocks same-frame
  duplicate confirmation, confirms only from a correlated committed frame, and
  rolls back with useful feedback on domain rejection or version conflict.
- On a 360dp-wide phone, verify the board acts as one coordinate-selection
  surface: nearest legal aim, coordinate announcement, cancel, and a separate
  non-overlapping 44dp confirm control. Do not count overlapping 44dp targets on
  each of the 15 intersections as valid accessibility coverage.
- While a WebSocket is healthy, verify the 3-second active-game poll is absent.
  Interrupt the socket and confirm bounded HTTP/outbox recovery starts; restore
  it and confirm polling stops after a monotonic catch-up snapshot.
- Disconnect and reconnect each device, background/foreground it, restart the
  app after an unacknowledged move, and restart the Rust service. Input must stay
  disabled until catch-up; a durable request ID may mutate the game at most once.
- Make one subscriber slow and force a version gap. It may skip intermediate
  versions but must receive the latest actor-projected snapshot without an
  unbounded queue or another participant's viewer/slot projection.
- Resign from each side and finish by five in a row. Both devices must show the
  same winner/reason, reject every post-terminal move, and preserve the result
  after app reload. Verify only the terminal current-session host has
  `canRematch`, rematch creates a new linked session, and both devices obtain new
  tickets and enter the same reset board.

2026-09-12 local device evidence for the realtime slice:

- S23 `R3CW50BW8KB` (1080x2340, student `test`, black) and A20
  `R59M904MEMY` (720x1560, student `공서희`, white) joined board
  `cmtx9ttb50011vs30ai2j2pso`, session
  `fabf8167-1399-4f2f-99e4-4d2bf56c9d66` in Expo Go portrait mode.
- Two sustained connections to the isolated Rust realtime listener remained
  established. Black → white → black → white propagated in both directions;
  after the final white move both boards showed the same new stone, S23 showed
  `내 차례`, and A20 showed `상대 차례`.
- With both sockets healthy, the isolated Next log contained no active-session
  poll or command POST. Its byte length remained unchanged across the final
  move, so that move did not use the HTTP command fallback.
- Backgrounding S23 disconnected its socket; foreground/deep-link recovery
  obtained a new ticket and restored the second sustained socket and current
  board. This verifies the exercised foreground reconnect path, not every
  failure-injection row below.
- Aim, separate confirm, and the immediate pending state were visually checked
  on A20. Android static-frame recording and variable ADB input return time did
  not provide trustworthy touch/commit/peer p50 or p95 numbers, so the latency
  thresholds above remain a measured rollout gate rather than a claimed pass.
- Evidence is preserved at
  `C:\Users\coseung2\AppData\Local\Temp\aura-board-omok-device-current`.
  `s23-after-final-white.png` and `a20-after-final-white.png` are the final
  convergence pair. The authoritative version number was not independently
  queried in this pass.

2026-09-12 rolling-contract follow-up:

- The still-running pre-change Rust binary returned a valid version-16 snapshot
  whose `viewer` omitted only `capabilities`. The Expo strict validator rejected
  that HTTP 200 body and A20 stayed on `대국 준비 중 / 연결을 확인해 주세요`.
- The mobile boundary now normalizes only that exact legacy omission to
  `canRematch: false`. Current `true` is preserved; null, partial and malformed
  capability values remain rejected. HTTP current-session/command/rematch and
  all snapshot-bearing WebSocket frames share the same parser.
- Mobile Vitest passed 59 tests across the compatibility, move-machine and
  socket suites. Mobile TypeScript and `design:check` passed, as did scoped
  `git diff --check`.
- After an explicit React Native bundle reload from the current Metro project,
  A20 restored the same session at version 16 with 16 stones and `상대 차례`.
  No resign/command POST was sent. Baseline and recovery evidence are
  `a20-legacy-contract-baseline.png` and `a20-after-rn-reload.png` in the
  evidence directory above.
- Do not treat that compatibility smoke as a fresh two-device convergence run.
  Expo Go route history redirected later direct-link attempts to the ordinary
  boards screen. The earlier S23/A20 WebSocket convergence remains the paired
  evidence. The running Rust process was not restarted, and no deployment was
  performed.
- Remaining release gates: trustworthy RN native-paint p50/p95 instrumentation,
  Rust/Postgres restart recovery, shaped slow/offline/ack-loss/slow-subscriber
  tests, and limited-classroom rollout with rollback thresholds.

- Create a session and confirm the server assigns unique `first` and `second` slots. Reload web and Expo before either student is ready; both must recover the same `waiting` snapshot.
- Ready one participant, reload, and confirm only that participant is ready. Ready the second participant and confirm the session becomes `ready` but does not start automatically.
- Start as the host. Confirm participants cannot start and the host cannot place a stone.
- Submit a legal move and verify response version, persisted state, page reload, the other client, and Postgres all agree.
- Submit two commands with the same `expectedVersion`; confirm one commits and the other receives `409 version_conflict` with the current authorized snapshot and no extra outbox row.
- Simulate a lost successful response, then retry the exact same `requestId`, actor, and payload. Confirm the stored response is returned with `x-idempotent-replay: true`, no second mutation occurs, and the version advances only once.
- Reuse the same request ID with a different payload or actor and confirm `idempotency_key_reuse` with no mutation.
- Background the Expo app, change state from another client, and foreground it. Confirm snapshot reconciliation completes before board input is enabled.
- Disable or interrupt Realtime and confirm web fallback polling and Expo fallback polling recover the latest version; restore Realtime and confirm polling no longer remains the primary path.
- Finish once by five-in-a-row and once by resignation. Confirm the result cannot change and no further move is accepted.
- Create a rematch as the host. Confirm a new session ID, `previousSessionId`, swapped slots, reset board, version `0`, and exactly one current session for the board.

### Shadow Alliance authoritative matrix

- Run every case in `services/play-engine/contracts/shadow-alliance-parity-v1.json`; Rust and TypeScript must produce identical winners, averages, differences, and per-player gains.
- Before reveal, inspect student snapshots and page HTML. Other students' submitted numbers must be absent; only `submitted: true/false` may be visible. The submitting student may see only their own number.
- Pause a playing round, background and reconnect both clients, then resume. The server-owned remaining time must be preserved and no browser timer may advance phase or write a result.
- Submit two Shadow commands with the same expected version. Confirm one commits and the other receives an authorized `409 version_conflict` snapshot.
- Simulate a lost successful Shadow response and retry the exact request ID. Confirm the receipt is replayed before version comparison and no duplicate mutation, outbox row, or `GameResult` appears.
- Forfeit one joined participant during lobby and during play. Confirm exactly one personal forfeit result is stored, the aggregate continues, and later completion does not duplicate that result.
- Verify `playing -> revealing -> postround -> next_round` and final `postround -> finished` require explicit host commands. Timer expiry alone must not invent a winner.
- Finish normally and with host-ended. Confirm state, all remaining personal results, receipt, and outbox row commit atomically.
- Create a Shadow rematch. Confirm a new aggregate ID, `previousSessionId`, version `0`, reset private submissions, and exactly one current `PlaySession` for the board.

### Outbox and operability

- Confirm session state, request receipt, and outbox row commit atomically. Force a transaction failure and verify none of the three remain.
- Run `/api/cron/play-outbox` with staging cron authorization. Confirm only `{eventId, sessionId, boardId, version}` is broadcast and only successfully delivered IDs are completed with the current claim lock token.
- Force a broadcast failure, wait for the lease to expire, and confirm the row is reclaimed without duplicating game state.
- Inspect logs and metrics for route/status counts, conflicts, idempotency reuse, outbox pending age/attempts, transaction latency, and lock wait. Confirm assertions, secrets, student identifiers, command bodies, and snapshots are absent from logs.
- Do not enable production routing, apply the production migration, or change production secrets until the staging matrix, web smoke test, and physical-device Expo smoke test pass and an operator explicitly approves rollout.

## Mobile Parity And Android Release

- Run `npm run typecheck` and `npm run design:check` in `apps/mobile`.
- Run `npm run release:check` in `apps/mobile`. The same check runs as the
  `eas-build-pre-install` hook and must fail if the HealthKit module sources,
  podspec, config plugin, or anchored native-directory ignore rules are absent.
- Before an iOS store build, inspect the EAS upload archive and confirm it
  contains `modules/aura-board-health-connect/ios/AuraBoardHealthConnectModule.swift`
  and `modules/aura-board-health-connect/ios/AuraBoardHealthConnect.podspec`.
- Run `npx expo export --platform android --clear` to prove the Metro bundle and
  font/assets graph before requesting a signed build.
- Compare student and parent navigation, loading, empty, error, session-expiry,
  notification, and save states at phone and tablet widths.
- For a mobile save or submit action, verify the server response and reload the
  same route before treating optimistic state as proof.
- At phone and tablet widths, verify multiline placeholders and entered Korean
  text are fully visible and top-aligned; shared back buttons are flat,
  vertically centered with the title, and retain a 44px hit target.
- Reject redundant card-within-control framing: ordinary forms use spacing and
  hierarchy unless the whole region is a genuinely separate card surface.
- Before EAS build, bump the user-visible app version when the release is a
  material UX change and enable remote Android `versionCode` auto-increment.
- Build with the final pushed commit. Confirm the EAS build `gitCommitHash`,
  version, versionCode, artifact type (`.aab`), and finished status.
- Submit the exact verified build ID. Confirm the Google Play production track
  and release status; a successful AAB build alone is not a Play release.

## Mobile Tablet Rotation And Short Height

Implementation plan: [mobile-tablet-ux-plan.md](mobile-tablet-ux-plan.md).

- Run mobile `npm run typecheck`, `npm run design:check`,
  `../../node_modules/.bin/vitest run`, `npm run release:test`,
  `npm run release:check` and `npm run assets:check`; run repository
  `npm run test -- mobile`. The design scan includes extracted `screens/`.
- Exercise 430×932, 932×430, 800×1280, 1280×800, 1366×1024 and 320×480
  app windows. Include split-screen/free-form resize and font scales 1.0, 1.3
  and 2.0. These are logical window sizes, not screenshot pixel resolutions.
- With each dialog already open, rotate in both directions, resize, open/close
  the keyboard and focus the last field. Verify content can scroll, every
  action can be reached, touch targets remain usable, and neither sheet nor
  drawer overlaps system bars. Test backdrop, Android Back, drag handle and
  close-button dismissal independently.
- Cover card create/edit, feed create/edit, reading, assignment, observation,
  daily banner, DJ request/history, author selection, comments/replies,
  walking settings/permission/error, plant stage details/no-photo custom
  reason, pet wardrobe and purchase with quantity/warning/vehicle preview.
  Retain drafts/attachments across rotation; submit and reload to verify the
  server result. Do not perform destructive actions against production data.
- Long-press a long comment/post near each screen edge, then rotate with the
  menu open. Repeat on both the full comment route and a comment bottom sheet.
  Actions must fit the measured overlay root, including any navigation below
  it, and remain reachable with large fonts or an oversized preview.
- Confirm card/column feeds have a readable width in either orientation;
  check grid/game/pet sizing after left/right safe insets change. Open the
  image lightbox and project viewer and verify safe, reachable close controls.
- In quiz waiting/active/error/finished states, verify full option text and
  scroll fallback; check wide split versus large-font stacked layouts.
  In speed-game lobby/active/result states, use long participant/score lists,
  focus the answer with keyboard open, and reach the last action. Game HUD
  must not cover score/status controls; rotating must not reset answers or
  server game state. Existing independently scrolling games must not acquire
  nested vertical scroll owners.
- Android bundle/native verification uses the final pushed commit and the
  [Windows validation workflow](mobile-android-build.md#github-actions-windows-validation).
  Record its run ID, head SHA and final conclusion separately from local tests.
  A queued or running workflow is not a successful build.
- Geometry and source-contract tests do not prove native Yoga layout,
  keyboard/IME behavior, touch routing or accessibility focus. Physical Android
  tablet and iPad checks above remain required before claiming device UX
  acceptance. No physical-device acceptance was performed in this code pass.

## Public web/mobile consistency

Plan and scope: [web-mobile-consistency-plan.md](web-mobile-consistency-plan.md).
The ordinary-user layout allowlist, not the presence of a route file, controls
scope. Administrator/development-only feature implementations remain excluded.

### Automated regression gates

- Run `npm run test -- cache reward-service snapshot-revalidation` and
  `npm run test -- public-mobile mobile-board-realtime mobile-focused-refresh`.
  Verify invalidation during an in-flight read, unrelated-key invalidation,
  expired pending entries, cold viewer-like caches, parent prefix invalidation,
  and board removal. A completed old promise must not become an immortal cache
  entry or restore inaccessible data. Explicit `x-aura-revalidate: 1` reads must
  bypass a settled process-local snapshot while retaining single-flight work.
- Run `npm run test -- share-api ShareSessionContext SupabaseShareBoardClient
  useBoardStream useRealtimeInvalidation useBoardSnapshotRealtime CardEngagement`.
  Share writes must fall through to the canonical HTTP API with token and guest
  headers intact. A display name is not ownership proof. Old-link responses
  cannot replace the current link, and forbidden/deleted content is cleared.
- Run card/board mutation and plant-observation route tests. Confirm successful
  create/edit/delete, author changes, section moves, board settings/deletion,
  DJ queue changes and plant journal writes reach their invalidation publisher
  after commit. Cleanup reservation failure must not suppress a committed
  deletion's signal or return a misleading mutation failure.
- Mobile lifecycle tests must prove: one ref-counted board channel; one public
  detail refresh owner; no snapshot polling while inactive; a foreground
  reconciliation even after less than 15 seconds; initial/reconnect catch-up;
  retryable missing runtime configuration; HTTP retry even with a healthy
  socket; bounded event coalescing; and cleanup of a late subscription.
- Run root and mobile type checks, mobile design checks, full root tests,
  `npm run check:lines`, `npm run check:encoding`, and the production web build.
  Native hook tests use `.vitest.ts` so React Native global DOM declarations
  are not accidentally imported into the web TypeScript program.

### Real two-client acceptance matrix (not covered by mocks)

| Public surface | Change to exercise | Expected recovery |
| --- | --- | --- |
| Freeform, columns, existing grid | Web/mobile/share create, edit, delete, author change and section move | Safe board broadcast followed by an authorized fresh snapshot; no resurrected cards, stale section counts or orphaned edit/comment overlays |
| Shared link | Delete from an ordinary board; edit from a guest link; revoke the token | HTTP mutation path and guest ownership preserved; initial/reconnect/focus recovery; revoked content disappears |
| DJ queue | Submit, approve, move, play and remove from the other client | Queue signal uses the same parent snapshot owner; optimistic pending rows are reconciled without a competing interval |
| Plant journal | Teacher/student observation create/edit/delete, nickname and stage change | Both teacher summary and the student's own authorized journal refresh; no journal content in public broadcast payloads |
| Comments | Keep a thread open; create/delete/reply from another client; background briefly | Refresh without clearing the unsent draft or exposing a guardian-only thread; closing/deleting the card clears its overlay |
| Bank | Mutate while an older wallet GET is pending; switch away and return | A forced post-mutation read runs after the older GET; focus/foreground refreshes balances; no permanent short-interval balance poll |
| Cleaning/shoe inspection | Update the server, return to the route while local edits exist | Latest roster is loaded, edited draft rows survive automatic refresh, denied access clears old roster |
| Existing event-signup | Refresh event metadata and enter its existing secure web form | Public detail recovery remains active; native/web form differences are intentional, not an alternate write authority |

For every relevant row, interrupt Realtime, modify from the other client, then
restore it. Verify fallback polling stops after subscription recovery. Also
hold one HTTP snapshot open, perform the mutation, and release the old response
last. Check the response/body and subsequent reload rather than treating an
optimistic screen as persistence proof. Record the installed mobile build,
server commit, client identities, status codes and actual measured delay.

Keep bounded reading-feedback job polling, local display clocks, and native
walking-health foreground synchronization. These are not interchangeable with
board Broadcast polling. Do not auto-replace unsaved inspection/comment drafts
merely to make a screen appear fresh.

A source push is not mobile rollout or device acceptance. Rebuild/install the
mobile application for native-source changes; refresh already-open legacy share
pages to use the canonical HTTP bridge. Run the documented
[Windows Android validation](mobile-android-build.md#github-actions-windows-validation)
for the exact pushed SHA. Production multi-process/load testing and physical
Android/iPad two-client verification remain separate acceptance gates; this
change's unit tests do not measure production propagation latency.

## Test Fixtures

### Native student input pages (2026-09-11)

- Installed Expo app only: reading, board post create/edit, feed create/edit,
  card/feed comments, assignment submission, plant observations and daily banner
  composition use full-screen input routes. Short contextual sheets remain.
- On an Android tablet and iPad, open each route in landscape, focus the final
  field, rotate with the keyboard visible and submit without hiding the keyboard.
  Confirm fields and actions remain reachable, with no repeated viewport jumps.
  Android uses native resize; iOS has one keyboard-avoidance owner.
- Verify hardware/header Back and discard confirmation, upload/save navigation
  protection, validation/network failure draft retention and successful return
  with the existing toast. Reopen a new reading draft after editing a saved entry
  and confirm the two drafts remain separate.
- Verify saved content after returning and reloading; check comment audience,
  reward feedback, feed counts, assignment deadline/locked explanations and
  asynchronous reading feedback after leaving the input route.
- Automated checks cover native route contracts, exit guards, reading draft
  transitions and parity of mobile reward/reading notices with shared behavior.
  Android bundle export is not an installed-device keyboard acceptance check.
  No connected device was available for this change's physical-device checks.

### Canva reviewer credentials

- Open `/login?review=canva` in a signed-out private browser and confirm the
  reviewer email/password form is visible while `/login` keeps the normal UI.
- Confirm a wrong email and wrong password return the same generic error and do
  not create a `User` row.
- Confirm the provisioned reviewer account signs in, reaches
  `/teacher/settings#canva`, and remains signed in after a page reload.
- Confirm Google and Kakao teacher sign-in still work after the credentials
  provider is enabled.
- Confirm repeated invalid reviewer attempts are rate-limited and that a
  transient production rate-limit failure is fail-closed for this provider.

## Song guess folder ingestion

- `node --test scripts/song-guess-register-metadata.test.mjs`: artist/title alias matching without composer requirements, same-title different-artist separation, and ambiguous source matches. Production registration must compare live DB rows before insert and read back every resulting song ID.

- `python scripts/song-guess-chart-scrape.test.py`: description/chapter parsing, explicit uploader ranks, alias/reverse-order catalog matching, stable IDs across videos, missing/short/ambiguous segments, chart disclaimer and date separation. Live trial reports with zero extracted tracks are a source limitation, not end-to-end extraction success.

- `node --test scripts/song-guess-ingest.test.mjs scripts/song-guess-import.test.mjs`: normalize tags/filename/overrides, preserve performer/composer, classify decades, reject invalid sources/segments, deduplicate recordings, detect conflicting metadata, preserve provenance through repeated imports.
- `npx vitest run src/lib/song-guess/catalog-sync.vitest.ts`: dry-run has no writes; apply preserves metadata; repeated upload skips unchanged audio.
- Before a real batch: inspect `ready/review/warnings`, run with FFmpeg/FFprobe installed, then validate generated 15-second clips and the intended DB/storage environment. A skipped FFmpeg test does not verify real extraction. Production registration is a separate operation.

- Student login code: `DCY366`
