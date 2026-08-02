# Game Result Backfill Runbook

This runbook governs historical `GameResult` discovery and controlled writes.
Schema migrations must never synthesize gameplay history.

## Safety boundary

- The default command is a read-only dry run:
  `npm run game-results:audit`
- The audit reads authoritative relational fields, validates classroom and
  student identity, validates terminal timestamps, and reports each candidate
  as `safe`, `unsafe`, or `existing`.
- Legacy `SpeedGameAnswer` rows and browser-owned Shadow Alliance state are
  always excluded. They cannot prove immutable participation or terminal
  authority.
- A database migration may add tables, constraints, indexes, RLS, and grants,
  but it must not insert historical `GameResult` rows.
- Production writes are prohibited by the tool.

## Dry-run procedure

1. Use a read-only or staging database credential.
2. Generate Prisma Client and validate the schema:
   `npx prisma validate && npx prisma generate`
3. Run the audit with an explicit scan limit:
   `npm run game-results:audit -- --limit=500`
4. Save the JSON output in the operator's protected incident/change record.
   Do not commit student identifiers or row-level output to the repository.
5. Review every `unsafe` reason. A row is not made safe by manually deleting a
   reason from the report; the underlying authoritative data must be corrected
   or the row remains excluded.
6. Compare `existing` rows by idempotency key. A semantic mismatch is an
   incident and must stop the operation.

## Controlled staging write

Writes require all three controls:

1. `--apply`
2. `--environment=staging`
3. `GAME_RESULT_BACKFILL_CONFIRM=APPLY_STAGING_GAME_RESULTS`

Example for an approved staging rehearsal:

```text
GAME_RESULT_BACKFILL_CONFIRM=APPLY_STAGING_GAME_RESULTS \
  npm run game-results:audit -- --apply --environment=staging --limit=100
```

The tool refuses production through both `NODE_ENV` and `VERCEL_ENV` checks.
Do not weaken or bypass those checks. A production backfill requires a new,
reviewed operator tool and an explicit change plan; this implementation does
not provide one.

## Verification after a staging rehearsal

- Re-run the same command without `--apply`; previously written rows must be
  reported as `existing`.
- Confirm one row per idempotency key and one personal row per eligible
  student/source.
- Query through the authenticated student records API. A student must see only
  their own results.
- Confirm metrics contain only the game-specific whitelist and no answer text,
  submitted Shadow number, song answer, actor subject, email, or storage key.
- Confirm `startedAt <= completedAt`, non-negative safe-integer durations, and
  exact board/classroom/game-kind agreement.
- Confirm operational logs contain counts and opaque request/source IDs only;
  do not log full metrics or student rosters.

## Stop and recovery conditions

Stop immediately when any of these occur:

- a semantic idempotency conflict;
- a board/classroom/student mismatch;
- a missing or reversed terminal timestamp;
- a metric validation failure;
- a production environment detection;
- a row derived from legacy mutable browser state.

The write path is append-only and idempotent. Do not delete or update rows as an
automatic rollback. Quarantine the change, preserve the audit output in the
restricted change record, identify the exact idempotency keys, and prepare a
separate reviewed correction plan.
