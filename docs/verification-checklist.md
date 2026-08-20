# Verification Checklist

Use this checklist as the single source of truth before calling a change done.
Pick the smallest checks that prove the user-facing behavior, then report
exactly what passed and what still has risk.

When adding project-specific verification guidance, update this file instead of
creating overlapping testing-notes documents.

## Baseline

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

### Teacher content library and Canva PDF export

- Add a columns-board section containing an Aura-hosted image, an external
  image, and a Canva design. Confirm the Aura image keeps its existing object
  URL, the external image is copied once into teacher-library storage, and the
  Canva item stores only its design identity and display metadata.
- Delete the source card and run blob cleanup after its delay. Confirm an Aura
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
- [ ] Expose `supabase.aura-board.com` through the intended nginx/Cloudflare path and verify representative public/private downloads, signed URL behavior, CORS, and persisted URL compatibility before any app env switch.
- [ ] Sync the S3 credential from the root-owned mode `0600` A1 env into Infisical without printing values; verify rotation and recovery procedures.
- [x] Create/reuse a Bastion session through the runner identity, write ACTIVE metadata, complete local SSH port forwarding to the A1 `ubuntu` account, replace public `0.0.0.0/0:22` with target-subnet TCP/22, and verify external TCP/22 is closed while Bastion SSH and public HTTPS health remain successful.

## Supabase Free + Vercel Warm Standby DR

Oracle Osaka remains the primary for this DR scope. Supabase Free and Vercel are a warm standby path, not active-active production. Until the separately approved production cutover, managed Supabase Pro remains the current production database source of truth. The operational scope and evidence handoff are in [`docs/infrastructure-handoff.md`](infrastructure-handoff.md) and the design constraints are in [`docs/supabase-selfhost-dr.md`](supabase-selfhost-dr.md).

Do not mark any item below complete from a staging-only observation. Record the target project/endpoint, UTC timestamp, deployment or commit SHA, and sanitized SQL/log artifact for every result; never record secret values.

### Promotion control

- [ ] Confirm the runbook requires an operator-approved primary write fence or confirmed Oracle unavailability before promotion. Record the approver, incident ID, fence result, last replicated LSN/heartbeat, and promotion time.
- [ ] Confirm Oracle and DR cannot remain writable at the same time during failover, preventing split-brain. Automatic timeout-only promotion and automatic DNS switching must be disabled or explicitly guarded by the fence.

### Data and service parity

- [x] Compare primary and Supabase Free migration history plus schema-only/catalog evidence: 167 tables, 625 indexes, public/private functions 8/7, trigger 9, RLS policy/table 18/167, Realtime publication 6, and 148,993 rows exact match. Share RLS allowed/denied probes retained in the 2026-08-20 handoff.
- [x] Verify logical replication publisher/subscriber state: 167/167 tables replicating, `pgoutput` source slot active, apply/sync errors 0, one-minute heartbeat replicated, latest-end age approximately 1.15 seconds during acceptance.
- [x] Exercise DR PostgREST: service-role `200`/1 row; anonymous no token `200`/0; valid share token `200`/1; invalid token `200`/0.
- [x] Join DR Realtime and verify Broadcast plus Oracle-origin `postgres_changes`; the canary update was received in 1.134 seconds.
- [x] Create a dedicated `aura-board-dr` Vercel project in the approved team, apply the Next.js framework preset, and verify it has no production env or deployment before Supabase DR is connected.
- [x] Verify Vercel DR deployment `dpl_5Hu4bGn2aBDEut8YJop2qUt2R3zo` is production `READY` in `icn1` for exact SHA `f35286e1`, with 42 production env names, `/api/health` returning `200`/database reachable/replication fresh, the global media-degraded notice present, unauthenticated upload remaining auth-first `401`, and no deployment error logs.

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

- Open the teacher `학급` mega menu and confirm its groups are `학급 선택`, the selected classroom's `관리`, `학급 운영`, and `활동·기록`. Confirm `1인1역` opens `/classroom/:id/roles`; the misleading `1인1역할` group is absent.
- Open the classroom dashboard and confirm it contains only the classroom name actions and non-interactive summary values. It must not render feature links, a local navigation landmark, a tablist, or the former `대시보드 / 학생 명단 / 자리 배치 / 학급 보드 / 금융 관리` and `포트폴리오 / 1인1역 / 과제 / 청소` controls.
- Open `/roles`, `/morning`, and `/assignments` as the owning teacher and confirm each page renders only its named task. Verify another teacher receives the existing not-found boundary.
- Open walking, daily-banner, and reading pages and confirm each uses its own page title without cross-feature navigation tabs. Preserve the finance page's `입출금 / 거래 기록` view switch because it changes views within one task.

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

### Staging database and service checks

- Use a disposable or staging Postgres database only. Apply the migration and confirm `PlaySession`, `PlayParticipant`, `PlayRequestReceipt`, and `PlayOutbox` exist.
- Confirm `anon` and `authenticated` cannot select, insert, update, or delete any authoritative play table.
- Confirm the private Rust database role can transact against all four tables.
- Start Axum with private staging configuration and verify `/health` only through the intended private network path.
- Verify Next rejects a missing, expired, or tampered actor assertion and never accepts a client-supplied actor subject or slot.
- Verify a teacher can create an Omok session only from two students in the board classroom; a student outside that classroom and a non-member teacher receive `403`.

### Lifecycle and recovery matrix

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

## Test Fixtures

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

- Student login code: `DCY366`
