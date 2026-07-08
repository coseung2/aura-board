# Verification Checklist

Use this checklist as the single source of truth before calling a change done.
Pick the smallest checks that prove the user-facing behavior, then report
exactly what passed and what still has risk.

When adding project-specific verification guidance, update this file instead of
creating overlapping testing-notes documents.

## Baseline

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

## 400+ Student Rollout

- Confirm production `DATABASE_URL` uses the Supabase IPv4 transaction pooler
  with Prisma PgBouncer mode enabled, and scan Vercel logs for both
  `Can't reach database server` and `prepared statement ... already exists`.
- Confirm shared rate limiting is configured in production; in-memory
  fallbacks are not enough for multi-instance Vercel traffic. Validate that
  IP-axis limits tolerate a 400+ student same-NAT burst.
- Test a same-class login burst with the student fixture and at least one real
  classroom code path, then check `/api/student/auth` error and 429 logs.
- Test upload round trips with images below 4 MB, oversized images that can be
  client-compressed, and non-image files above 4 MB so the UI shows a clear
  rejection instead of hanging.
- For stream-heavy classes, open a board with multiple viewers and confirm
  idle streams produce cheap version probes rather than repeated full snapshots;
  confirm speed-game answer writes bump `SpeedGame.updatedAt`, then run a
  separate load test before using speed-game with a whole cohort.

## Test Fixtures

- Student login code: `DCY366`
