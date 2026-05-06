# Aura Board Agent Guide

This repository uses Codex as the supervising agent and opencode workers for
bounded specialist tasks. The project source of truth is the current code,
`README.md`, `docs/`, and `CLAUDE.md`.

## Working Rules

- Respond in the user's language.
- Keep edits scoped to the user's request.
- Follow existing project patterns before introducing new abstractions.
- Do not read secret env files unless explicitly asked and required.
- Do not run git commit, push, branch, reset, or clean unless the user
  explicitly asks in the same turn.
- Report changed files, verification commands, and remaining risk.

## Local Commands

- Development server: `npm run dev`
- Type check: `npm run typecheck`
- Tests: `npm run test`
- Production build: `npm run build`

For frontend verification after design changes, clear `.next` and restart the
dev server before browser checks when practical.

## Opencode Workers

Use opencode workers only for narrow, bounded tasks.

- `frontend`: UI, CSS, React components, responsive layout, visual QA, and
  user-facing flows.
- `backend`: API routes, Prisma, auth, permissions, cron, and reliability.
- `docs`: README, API docs, and project documentation.
- `frontend-audit` and `backend-audit`: read-only review agents.

Prefer attaching exact files and one concrete concern. Avoid whole-repo or
whole-UI audit prompts.

Reliable command shape:

```powershell
opencode run "prompt first" --agent frontend --model opencode-go/mimo-v2.5-pro --file "src/path/file.tsx"
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
