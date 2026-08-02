# Authoritative Play Platform

## Scope

This document describes the authoritative play vertical slices: 1:1 Omok and
teacher-owned song-guess across Rust, Postgres/Supabase, and Next.js. It is an
architecture and operations reference. The repository-wide verification source
of truth remains `docs/verification-checklist.md`.

This work does not deploy services, apply a production migration, change
production secrets, or mutate production data.

## Process and trust boundaries

```text
web / Expo
  -> existing Next.js teacher or student authentication
  -> board/classroom authorization and actor resolution
  -> short-lived HMAC actor assertion
  -> private Axum play service
  -> Postgres transaction (session + receipt + outbox)
  -> Next cron outbox consumer
  -> Supabase Broadcast compact invalidation
  -> clients reload authoritative snapshot
```

The public clients never receive the Postgres connection, Rust service URL,
actor assertion secret, internal outbox secret, service-role key, or participant
actor subjects. The create-session proxy accepts two student IDs, re-queries the
board classroom, and converts only valid students into server participant seeds.
Subsequent commands contain intent, `requestId`, `expectedVersion`, and schema
version. The persisted actor subject determines the logical side.

## Authoritative aggregate

`SessionRecord` is the recoverable aggregate. It includes:

- immutable `sessionId`, `boardId`, host subject, rules version, state schema
  version, previous-session link, and creation time;
- monotonic safe-integer `version`;
- two unique participant subjects with unique `first` and `second` slots;
- room lifecycle, readiness, Omok domain state, and terminal outcome.

Every load validates both aggregate invariants and the embedded Omok domain
state. An invalid persisted aggregate is a server error, not a client repair
request.

### Lifecycle

```text
waiting
  participant ready -> waiting or ready
ready
  host start -> active
active
  participant place_stone -> active or finished
  participant resign -> finished
finished
  host rematch -> new waiting session
```

A rematch creates a new session rather than resetting history. It points to the
previous session and swaps slots. The board's partial unique index permits only
one `current = true` row.

## Idempotency and concurrency

The Postgres repository owns command ordering:

1. Begin a transaction.
2. Look up `(scopeType, scopeId, requestId)` and compare the stored request hash.
3. If it matches, return the stored response before checking current version.
4. Lock the session row.
5. Authorize the persisted actor membership.
6. Compare `expectedVersion`.
7. Apply the Rust domain intent.
8. Increment the version and validate the complete aggregate.
9. Write aggregate state, response receipt, and compact outbox row.
10. Commit.

The request hash includes scope, actor subject, actor role, expected version,
and payload. A reused key with changed content returns
`idempotency_key_reuse`. A genuine stale command returns `409 version_conflict`
with the currently authorized snapshot. Clients do not optimistically place a
stone; input remains disabled until the response or a recovery snapshot arrives.

Board-scoped Postgres advisory transaction locks serialize initial creation and
rematch pointer changes even when no current row exists yet. The partial unique
index is the final database invariant.

## Realtime and reconnect recovery

`PlayOutbox` is written in the same transaction as accepted state. The cron
consumer claims rows with `FOR UPDATE SKIP LOCKED`, a lock token, attempt count,
and a two-minute stale lease. Completion must present the same lock token, so an
expired worker cannot acknowledge a row reclaimed by another consumer. It
publishes only:

```json
{
  "type": "play_session_changed",
  "eventId": "...",
  "sessionId": "...",
  "boardId": "...",
  "version": 42
}
```

The event is an invalidation, not state. Successful event IDs are completed;
failed rows remain recoverable after lease expiry. Duplicate invalidations are
safe because clients reload snapshots.

Web uses the existing board invalidation hook: Supabase Broadcast first,
focus/visibility/online reconciliation, and 10-second polling only while
Realtime is unavailable. Expo uses the existing board channel registry,
foreground catch-up, and 15-second fallback polling while unsubscribed.

Web stores an unacknowledged command in browser storage. Expo stores it in
SecureStore. After reconnect or remount, the same request ID is retried once.
An accepted lost-response command replays its receipt; an unaccepted stale
command receives a conflict snapshot and is cleared.

## Postgres and Supabase security

The migration creates `PlaySession`, `PlayParticipant`,
`PlayRequestReceipt`, and `PlayOutbox`. RLS is enabled on all four tables and
all privileges are revoked from `anon` and `authenticated`. No browser policy
is created. The Rust service must use a private server database role that can
read and write these tables.

The broadcast consumer uses the existing server-only Supabase service role.
The service role is not sent to Rust or clients.

## Song-guess security boundary

Song-guess setup is teacher-owned and board/classroom authorization is checked
in Next before any setup or clip mutation. The representative answer,
normalized answer, explicit aliases, and clip object keys are server-only. The
Rust aggregate receives this setup through the private service boundary and
persists it inside the authoritative session state; its snapshot projection
contains only the current phase, scores, optional accessibility clue, and the
one currently unlocked clip's safe metadata.

The lifecycle is `draft -> lobby -> guessing -> reveal -> finished`. A host
opens the lobby, starts a round, unlocks the 0.5/1.0/1.5 second tiers in order,
reveals, advances, and finishes. A participant's first exact normalized answer
or explicit alias scores once for the round. The Rust rules award exactly
1000/700/400 points by unlocked tier and zero for wrong answers. Replays,
stale versions, and concurrent attempts use the same durable receipt and row
lock rules as Omok.

The upload endpoint accepts only browser-derived clips with MIME
`audio/wav`, `audio/mp4`, `audio/webm`, or `audio/ogg`, an 8 MiB maximum, and a
duration within 50 ms of exactly 500, 1000, or 1500 ms. The teacher UI uses
mono 44.1 kHz 16-bit PCM WAV so output frame counts and headers are
deterministic. It deliberately does not accept source audio and does not invoke
system ffmpeg. Clips are written to a dedicated private storage bucket (or a
non-public local development directory) under an opaque `song-guess/...`
object key. Students retrieve a clip only through the authenticated session
route when the authoritative snapshot names that asset as the current unlocked
clip; no public full-source URL is created.

### Browser ingestion workflow

1. The teacher selects a local audio file. The browser rejects empty files,
   files over 30 MiB, undecodable audio, decoded audio shorter than 1.5 seconds,
   decoded audio longer than 15 minutes, unsupported sample rates, or more than
   eight channels.
2. `AudioContext.decodeAudioData` receives the complete local `ArrayBuffer` and
   produces an in-memory `AudioBuffer`. The source filename is UI-only state;
   neither filename nor source bytes enter an API payload.
3. The teacher chooses a start point with a slider or number input and explicitly
   plays a 1.5-second source preview. Nothing autoplays.
4. The browser downmixes supported channel layouts to mono, linearly resamples
   to 44.1 kHz, and slices exact 22,050 / 44,100 / 66,150-frame segments. The
   pipeline rejects a start point that would require zero padding.
5. The browser writes canonical 44-byte PCM WAV headers and creates local object
   URLs for all three derivative previews. URLs and preview source nodes are
   revoked or stopped when replaced, removed, or unmounted.
6. A rights confirmation is mandatory for every new or replacement source.
   Saving uploads only the three WAV blobs, then writes one ordered setup payload
   containing opaque asset IDs, representative answers, explicit aliases, and an
   optional accessibility clue.
7. If any derivative upload or the atomic setup save fails, every successfully
   uploaded unassigned asset from that attempt is deleted through the authorized
   cleanup endpoint. Assigned assets cannot be individually deleted. Setup
   replacement deletes superseded object keys after the database transaction.
8. Once a current authoritative session exists, both the UI and server reject
   setup mutation. Realtime events are invalidations only; clients reload the
   redacted authoritative snapshot.

The design adopts Web Audio's complete-file in-memory decode and local PCM
processing model. It rejects external preview catalogues and ripping workflows:
preview availability is not guaranteed, third-party preview terms may restrict
standalone use, and remote source acquisition would break the copyright and
source-boundary requirements. Heardle-style progressive reveal informs the
0.5/1.0/1.5-second interaction, but not its remote music acquisition method.

### Web and mobile support boundary

The web board provides the complete teacher editor and teacher/student game
surface. It preserves unacknowledged commands in local storage and retries the
exact request ID after reconnect; conflict snapshots merge monotonically.

The Expo app now uses `expo-audio` for the student song-guess surface. It loads
only the authorized current snapshot and the server-gated derivative clip URL;
it never receives or uploads the source recording. Playback, reconnect,
pending-command, version monotonicity, and no-source-upload rules remain the
same as the web implementation. If setup or a current session is absent, the
native layout renders the explicit setup/waiting state rather than falling
through to a card layout.

## Shadow Alliance authority and scoring

Shadow Alliance is a Rust-authoritative `PlaySession` aggregate. Next and Expo
are intent clients only. There are no separate Prisma Shadow run, participant,
or choice tables, and browser state is never canonical.

The aggregate persists immutable session/board/classroom identity, participant
identity and join order, black/white team membership, readiness, forfeits,
power, round wins, the server-owned command target, round deadline, pause
remainder, private submissions, and revealed round history. Its phases are
`lobby`, `playing`, `revealing`, `postround`, `finished`, and `host-ended`.

The scoring contract is shared by Rust and TypeScript through
`services/play-engine/contracts/shadow-alliance-parity-v1.json`:

- each active participant submits an integer from 1 through 100;
- each authoritative target is an integer from 30 through 70;
- exact rational average distance chooses the closer team;
- the winning team divides a 10,000-power pool in proportion to submitted
  numbers;
- integer remainder uses largest-remainder allocation with student ID as the
  deterministic tie-breaker;
- an exact distance tie awards no power.

Before reveal, snapshots expose only submission status for other participants.
A participant can see only their own submitted number. Revealed numbers and
gains appear only after the Rust phase changes to `revealing`.

A participant forfeit writes that participant's personal `GameResult`
immediately and does not terminate the aggregate. Normal finish and host-ended
commands append every remaining personal result in the same database transaction
as aggregate state, outbox invalidation, and the durable request receipt.

## Next.js API surface

- `GET|POST /api/play/boards/:boardId/session`
- `GET /api/play/boards/:boardId/roster` (authorized host only)
- `GET /api/play/sessions/:sessionId`
- `POST /api/play/sessions/:sessionId/commands`
- `POST /api/play/sessions/:sessionId/rematch`
- `GET|POST /api/cron/play-outbox`
- `GET|PUT|POST|DELETE /api/song-guess/boards/:boardId/setup`
- `POST /api/song-guess/boards/:boardId/clips`
- `DELETE /api/song-guess/boards/:boardId/clips/:assetId` (unassigned only)
- `GET|POST /api/song-guess/boards/:boardId/session`
- `GET /api/song-guess/sessions/:sessionId`
- `POST /api/song-guess/sessions/:sessionId/commands`
- `GET /api/song-guess/sessions/:sessionId/clips/:assetId`
- `GET|PATCH /api/shadow-alliance/boards/:boardId`

Rust Shadow Alliance routes behind the private proxy:

- `POST /v1/boards/:boardId/shadow-alliance/sessions`
- `GET /v1/boards/:boardId/shadow-alliance/sessions/current`
- `GET /v1/shadow-alliance/sessions/:sessionId/snapshot`
- `POST /v1/shadow-alliance/sessions/:sessionId/commands`
- `POST /v1/shadow-alliance/sessions/:sessionId/rematch`

The proxy preserves Rust status codes, JSON error bodies, conflict snapshots,
cache-control, and `x-idempotent-replay` while hiding upstream addresses and
headers.

## Configuration

Rust:

- `DATABASE_URL`
- `PLAY_ENGINE_ASSERTION_SECRET` (minimum 32 bytes)
- `PLAY_ENGINE_INTERNAL_SECRET` (minimum 32 bytes)
- optional `PLAY_ENGINE_BIND`

Next.js:

- `PLAY_ENGINE_URL`
- matching `PLAY_ENGINE_ASSERTION_SECRET`
- matching `PLAY_ENGINE_INTERNAL_SECRET`
- existing Supabase server broadcast variables
- existing `CRON_SECRET`
- `SONG_GUESS_STORAGE_BUCKET`, a dedicated private Supabase Storage bucket
  for derived clips (development may use the non-public local fallback)

All values are server-only. No play secret belongs in a public browser or Expo
environment variable.

## Operability

Minimum signals for staging and production:

- Axum request count and latency by route/status, excluding assertion values and
  command bodies from logs;
- counts for `version_conflict`, `idempotency_key_reuse`, invalid phase, and
  persisted-state validation failure;
- `PlayOutbox` pending count, oldest pending age, attempts, dead rows, and claim
  latency;
- Next cron claimed/delivered/pending-retry counts;
- database transaction latency and lock wait time;
- client snapshot fetch failures and recovery latency without logging student
  identifiers or board state;
- derivative upload failures, cleanup failures, unassigned asset count/age, and
  private-storage delete failures without logging filenames, answers, or object
  keys.

A scheduled unassigned-asset age sweep is recommended as an operational
backstop for browser termination between upload and setup save. The interactive
flow already performs best-effort cleanup, but a closed tab cannot issue its
cleanup request.

Suggested alert boundaries must be calibrated in staging. A practical starting
point is oldest outbox age above five minutes, repeated persisted-state
validation failure, or sustained 5xx responses from either Next proxy or Axum.

## Staging promotion sequence

1. Apply the Prisma migration to an isolated staging database.
2. Configure private service networking and independent staging secrets.
3. Start the Rust service and verify `/health` from the private network only.
4. Configure Next and run the play outbox cron.
5. Execute the authoritative play section in
   `docs/verification-checklist.md`, including lost response, duplicate submit,
   stale version, background/foreground, reconnect, terminal, and rematch cases.
6. Inspect RLS behavior, outbox lag, logs, and metrics for data leakage.
7. Complete web and physical Android/iOS smoke checks.
8. Promote through the repository's normal operator-controlled deployment
   process. Do not apply production migrations from an interactive coding task.
