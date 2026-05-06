# Aura Board Project Notes

This repository is a Next.js board app. Use the current code, `README.md`,
and `docs/` as the source of truth. Use the opencode workflow described
below for worker tasks.

## Local Workflow

- Development server: `npm run dev`
- Type check: `npm run typecheck`
- Tests: `npm run test`
- Production build: `npm run build`

When a frontend change needs visual verification, clear `.next` and restart
the dev server before checking the browser.

## Opencode Worker Strategy

Use opencode workers for narrow, bounded tasks.

- Backend workers handle API routes, Prisma, auth, permissions, cron, and data
  integrity checks.
- Frontend workers handle one screen or one interaction at a time. Avoid broad
  requests such as "audit the whole UI"; split them into layout, mobile,
  touch, loading/error, or a single board type.
- For audits, prefer read-only agents and attach the exact files to inspect.
- The reliable CLI shape is:

```powershell
opencode run "prompt first" --agent frontend --model opencode-go/mimo-v2.5-pro --file "src/path/file.tsx"
```

Do not place the prompt after `--file`; this opencode version can interpret it
as another file path.

## Guardrails

- Keep edits scoped to the user's request.
- Do not read secret env files unless the user explicitly asks and the task
  requires it.
- Do not run git commit, push, branch, reset, or clean unless the user
  explicitly asks in the same turn.
- Avoid deleting local untracked runtime folders unless the user asks.
