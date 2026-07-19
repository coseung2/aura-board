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

## Pet Game Preview Gate

- Keep pet-game development Preview-only. Local `next dev` defaults to enabled,
  and Vercel Preview is the primary user-facing review surface.
- Set `NEXT_PUBLIC_FF_petGame=1` for Vercel Preview and
  `NEXT_PUBLIC_FF_petGame=0` for Production; prefer explicit `0` over an absent
  value. These public variables are embedded at build time, so redeploy after
  changing them.
- Before testing any environment with pet features enabled, apply the pet
  Prisma migration in that environment.
- On the deployed Preview URL, verify that the pet navigation, page, and API
  are available. Exercise the pet persistence flows through a successful
  response and page reload; optimistic UI alone is not sufficient.
- On the deployed Production URL, verify that pet navigation is absent and the
  pet page and API remain unavailable. Confirm legacy reading and walking
  behavior still works.
- Do not enable or expose the pet game in Production unless the user explicitly
  authorizes it in a later turn.

## Mobile Parity And Android Release

- Run `npm run typecheck` and `npm run design:check` in `apps/mobile`.
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
