# Aura Board Agent Guide

This repository uses Codex as the supervising agent and Codex/opencode workers
for bounded specialist tasks. The project source of truth is the current code,
`README.md`, `docs/`, and `CLAUDE.md`.

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

## Opencode Workers

Codex may proactively delegate to subagents/workers when a task is multi-layer,
multi-file, long-running, or benefits from parallel frontend/backend work. The
user does not need to explicitly request delegation every time.

Prefer Codex subagents when the tool is available. Use opencode workers for
narrow, bounded tasks when subagents are unavailable or when the global
orchestration skill specifically calls for opencode.

- `frontend`: UI, CSS, React components, responsive layout, visual QA, and
  user-facing flows. Use `opencode-go/glm-5.2`.
- `backend`: API routes, Prisma, auth, permissions, cron, and reliability.
  Use `opencode-go/minimax-m3`.
- `docs`: README, API docs, and project documentation.
- `frontend-audit` and `backend-audit`: read-only review agents.

Prefer attaching exact files and one concrete concern. Avoid whole-repo or
whole-UI audit prompts.

Reliable command shape:

```powershell
opencode run "prompt first" --agent frontend --model opencode-go/glm-5.2 --file "src/path/file.tsx"
```

Do not put the prompt after `--file`; this opencode version can interpret it as
another file path.

## Frontend Audit Scopes

Split frontend audits into small checks:

- One board layout or one board type.
- One overflow or scroll behavior.
- One mobile or touch interaction.
- One loading, empty, or error state.
- One component cluster.

Read-only audits should return P0/P1/P2 findings with file paths, evidence, and
a recommended fix order.

## Backend Audit Scopes

Split backend audits into small checks:

- One API family.
- One auth or permission path.
- One Prisma/data-integrity issue.
- One cron job.
- One polling or streaming behavior.

Read-only audits should distinguish confirmed bugs from residual risks.
