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
- Report changed files, verification commands, and remaining risk.
- Use `docs/verification-checklist.md` as the single verification source of
  truth, especially for save/publish flows, optimistic UI, production issues,
  and test fixture notes.

## Local Commands

- Development server: `npm run dev`
- Type check: `npm run typecheck`
- Tests: `npm run test`
- Production build: `npm run build`
- Mobile Android APK/AAB: follow `docs/mobile-android-build.md` and use
  `.codex\scripts\build-android.ps1` with a dedicated ASCII build directory.

For frontend verification after design changes, clear `.next` and restart the
dev server before browser checks when practical.
