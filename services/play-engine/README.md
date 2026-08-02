# Aura Play Engine

Aura Play Engine is Aura Board's authoritative multiplayer rules and session
service. Rust owns accepted commands, actor-to-slot membership, lifecycle,
versions, outcomes, durable idempotency receipts, and the transactional outbox.
Next.js owns the existing teacher/student login boundary and is the only public
proxy. Web and Expo clients render snapshots and submit intents; neither client
writes game state or Postgres rows directly.

No deployment, production migration, or production data mutation is performed
by this repository slice.

## Workspace

- `crates/play-domain`: deterministic Omok, song-guess, and Shadow Alliance rules with no
  clock, network, database, or random dependencies.
- `crates/play-server`: Axum transport, HMAC actor assertion verification,
  authoritative Omok session lifecycle, in-memory behavior tests, and SQLx
  Postgres repository.
- `contracts/authoritative-omok-v1.schema.json`: shared v1 JSON command and
  snapshot contract used by Rust, Next.js, web, and Expo.
- `contracts/authoritative-song-guess-v1.schema.json`: redacted v1 snapshot
  contract. It intentionally contains no answer, alias, original, future clip,
  or storage object-key fields.

The first product path is 15x15 freestyle Omok. Five or more contiguous stones
wins. Shadow Alliance remains a hardened domain engine but is not exposed by
this server yet. Song-guess uses a separate `song-guess` session projection;
its current phase is `draft -> lobby -> guessing -> reveal -> finished` and
its only public clip projection is the currently unlocked 500/1000/1500 ms
derivative.

## Authority and lifecycle

A board has at most one current play session. The lifecycle is:

```text
waiting -> ready -> active -> finished
```

- The host creates a session with two server-resolved student actor subjects.
- The server assigns `first` and `second`; clients cannot claim a side.
- Each participant sends `ready` once.
- The host sends `start` after both participants are ready.
- Active participants send `place_stone` or `resign`; the server derives the
  side from persisted membership and applies `play-domain` rules.
- A terminal result is persisted once. The host can create a new rematch
  session; the new session links to the previous one and swaps slots.

Every command carries a durable `requestId`, `expectedVersion`, and
`commandSchemaVersion`. Receipt lookup happens before the optimistic version
check, so a lost response can be retried with the same request and receive the
stored response even after the session version advanced. Reusing a request ID
with a different actor or payload is rejected.

## Persistence and realtime

The Prisma migration creates:

- `PlaySession`: aggregate state, current-session pointer, versions, rules and
  state schema versions;
- `PlayParticipant`: server-owned actor subject and logical slot index;
- `PlayRequestReceipt`: request hash and exact semantic JSON response;
- `PlayOutbox`: committed `session_created` or `session_changed` invalidations.

A successful mutation writes session state, receipt, and outbox in one Postgres
transaction. Browser roles have RLS enabled with no policies or grants. The
Next cron worker claims outbox rows, publishes only `{eventId, sessionId,
boardId, version}` on the existing Supabase board channel, and completes only
successful deliveries. Clients always reload a full authoritative snapshot.

## HTTP API

Public routes require `x-aura-play-actor`, a short-lived HMAC assertion issued
by the existing Next.js auth boundary:

```text
POST /v1/boards/{boardId}/sessions
GET  /v1/boards/{boardId}/sessions/current
GET  /v1/sessions/{sessionId}/snapshot
POST /v1/sessions/{sessionId}/commands
POST /v1/sessions/{sessionId}/rematch

POST /v1/boards/{boardId}/song-guess/sessions
GET  /v1/boards/{boardId}/song-guess/sessions/current
GET  /v1/song-guess/sessions/{sessionId}/snapshot
POST /v1/song-guess/sessions/{sessionId}/commands
```

Internal outbox routes require `x-aura-play-internal-secret`:

```text
POST /v1/internal/outbox/claim?limit=50
POST /v1/internal/outbox/complete
```

A `409 version_conflict` response includes `currentVersion` and an authorized
snapshot. Exact duplicate requests return the stored response and the
`x-idempotent-replay: true` header.

Outbox claims return a lease `lockToken`; completion must echo that token with
the delivered IDs. A stale consumer therefore cannot complete rows reclaimed
after the two-minute lease expires.

## Runtime configuration

The Rust process requires:

- `DATABASE_URL`: server Postgres connection with access to the private play
  tables;
- `PLAY_ENGINE_ASSERTION_SECRET`: shared HMAC secret, at least 32 bytes;
- `PLAY_ENGINE_INTERNAL_SECRET`: internal outbox secret, at least 32 bytes;
- `PLAY_ENGINE_BIND`: optional bind address, default `127.0.0.1:8081`.

The Next.js process requires:

- `PLAY_ENGINE_URL`: private network URL for the Rust process;
- the same `PLAY_ENGINE_ASSERTION_SECRET` and `PLAY_ENGINE_INTERNAL_SECRET`;
- existing Supabase server broadcast configuration and existing `CRON_SECRET`.
- `SONG_GUESS_STORAGE_BUCKET`: a dedicated private Supabase Storage bucket for
  browser-derived clips; it is not the public upload bucket.

Do not expose any of these as `NEXT_PUBLIC_*` or `EXPO_PUBLIC_*` values.

## Local verification

```powershell
rtk cargo fmt --manifest-path services/play-engine/Cargo.toml --all -- --check
rtk cargo clippy --manifest-path services/play-engine/Cargo.toml --workspace --all-targets -- -D warnings
rtk cargo test --manifest-path services/play-engine/Cargo.toml --workspace
rtk npx prisma validate
rtk npm run typecheck
rtk npm --prefix apps/mobile run typecheck
```

A live local server additionally needs a migrated disposable Postgres database:

```powershell
rtk cargo run --manifest-path services/play-engine/Cargo.toml -p play-server
```

## Promotion gate

Before production rollout, apply the migration to staging, configure private
service networking and secrets, run the lifecycle and recovery matrix in
`docs/verification-checklist.md`, inspect outbox lag and failures, and complete
web plus physical-device Expo smoke tests. Production deployment remains a
separate operator action.
