# Song Guess student-free room creation 500

- Date: 2026-09-13 (Asia/Seoul, KST)
- Status: source fix verified locally; production deployment pending

## Symptoms and impact

An authenticated student could load the production Song Guess catalog and
existing rooms, but creating a student-free room returned HTTP 500. The A20
device could not reach audio playback, guessing, or score verification through
that path.

## Evidence and cause

- A20 `R59M904MEMY` received `POST /api/song-guess/boards/cmscwcu7t000bvs2gjls57y9x/rooms` with HTTP 500 twice, for five and one requested rounds.
- Production catalog reads returned 20 classical songs and the existing teacher room.
- The production `PlayRequestReceipt_scope_type_check` accepts the fixed
  `song_guess_board_create` value but rejects a suffixed value.
- The Rust repository used `song_guess_board_create:<student-subject>` as
  `scopeType` for student-free rooms, so the receipt insert failed after the
  session, participant, and outbox inserts were otherwise valid.

## Response and verification

- Changed the Rust repository to keep the allow-listed scope type and place the
  student subject in `scopeId`, preserving per-student idempotency isolation.
- `cargo test song_guess` passed 22 tests and `cargo fmt --all -- --check` passed.
- A production-DB rollback transaction confirmed the corrected session,
  participant, and outbox inserts succeed; no row was committed.

## Follow-up

- Build and deploy the corrected play-engine release through the approved
  release path.
- Re-run A20 creation, private clip playback, correct/wrong submission,
  reveal, next-round, reload, and result checks after deployment.
- Add a database-backed regression test for the receipt scope contract.
