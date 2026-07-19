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

- Development server: `npm run dev`
- Type check: `npm run typecheck`
- Tests: `npm run test`
- Production build: `npm run build`
- Mobile Android APK/AAB: follow `docs/mobile-android-build.md` and use
  `.codex\scripts\build-android.ps1` with a dedicated ASCII build directory.

For frontend verification after design changes, clear `.next` and restart the
dev server before browser checks when practical.

## Pet Game Preview Policy

- Pet-game development is Preview-only. Keep it disabled and unexposed in
  Production until the user explicitly authorizes Production exposure in a
  later turn.
- Codex owns routine environment and deployment configuration within its
  available access. Ask the user only when required credentials or authority
  are genuinely unavailable.
- Follow `docs/verification-checklist.md` for the pet-game runtime contract,
  migration gate, redeployment requirement, and Preview/Production checks.
