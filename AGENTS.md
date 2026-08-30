# Aura Board Agent Guide

This repository uses Codex as the supervising agent and Codex workers
for bounded specialist tasks. The project source of truth is the current code,
`README.md`, and `docs/`.

## Working Rules

- Respond in the user's language.
- Keep edits scoped to the user's request.
- Follow existing project patterns before introducing new abstractions.
- Do not read secret env files unless explicitly asked and required.
- Do not run git commit, push, branch, reset, or clean unless the user
  explicitly asks in the same turn.
- When the user explicitly requests commit and push, commit directly to the
  current default branch (`main`) and push it. Create or use a separate branch
  only when the user explicitly asks for a branch, pull request, or draft PR.
- Report changed files, verification commands, and remaining risk.
- Use `docs/verification-checklist.md` as the single verification source of
  truth, especially for save/publish flows, optimistic UI, production issues,
  and test fixture notes.

## Local Commands

- Development secrets and environment variables are managed in Infisical.
  Do not expect a local `.env` file or start authenticated/database-backed
  development flows with plain `npm run dev`.
- Supabase DR control-plane commands must use `npm run supabase:dr -- ...`.
  The wrapper injects the read-only `SUPABASE_ACCESS_TOKEN_DR` from Infisical
  project `b850cd45-d5d6-4211-b33e-7641f45f3d48`, environment `prod`, path `/`,
  and maps it only in memory to the Supabase CLI's `SUPABASE_ACCESS_TOKEN`.
  The target project is `aura-board-dr` (ref `ivfwgyapgnpwwzllpync`).
  Never run `supabase login` with this token or copy the token into source,
  shell history, logs, or chat. Use `SUPABASE_DR_INFISICAL_ENV=dev` only for an
  explicitly dev-scoped operation.
- Web development server: `infisical run --env=dev -- npm run dev`
- Combined web and Expo development servers:
  `.codex\scripts\start-dev-servers.ps1` (injects the Infisical `dev`
  environment into both processes).
- When local auth or database APIs return configuration-related 500 errors,
  first verify that the server was launched through Infisical before changing
  application code or diagnosing the database.
- Type check: `npm run typecheck`
- Tests: `npm run test`
- Production build: `npm run build`
- Mobile Android APK/AAB: follow `docs/mobile-android-build.md` and use
  `.codex\scripts\build-android.ps1` with a dedicated ASCII build directory.

For frontend verification after design changes, clear `.next` and restart the
dev server before browser checks when practical.
