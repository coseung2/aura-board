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

## UX audit

For user-facing UX review, simplification, or cleanup anywhere in Aura Board, load `.codex/skills/aura-ux-audit/SKILL.md` before changing code. The audit must trace the actual user journey, mutations, authoritative state, and synchronization path rather than only rendered components. Reuse the relevant product docs and `docs/verification-checklist.md`; never invent stable feature rules from current DB contents, fixtures, or incidental production data.

## Figma design governance

Before any Figma task, read `docs/ai/global-figma-design-ops.md` and
`docs/design/figma-constitution.md`, then the relevant feature handoff/manifest.
Follow READ → CODE COMPARE → MIGRATION PLAN → FIGMA WRITE → SCREENSHOT VERIFY.
Use `docs/verification-checklist.md#figma-design-operations` for verification.

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
- Song-guess room list, room creation, and gameplay commands go through the Rust
  play-engine. When those routes answer 503 while the rest of the page works,
  start the engine before changing application code. Order and scripts are in
  `docs/authoritative-play-platform.md#local-development`:
  `.codex\scripts\open-db-tunnel.ps1 -SessionId <session> -RemotePort 15434`,
  then `.codex\scripts\start-play-engine.ps1 -Port 8090`, then
  `.codex\scripts\start-next-with-engine.ps1 -UseInfisicalOnly`.
  The DB tunnel targets loopback 15434 on the VM, not 5432, and the engine uses
  8090 because Metro owns its default 8081. `PLAY_ENGINE_URL`,
  `PLAY_ENGINE_ASSERTION_SECRET`, and `PLAY_ENGINE_INTERNAL_SECRET` are
  registered in Infisical `dev /`.
- Type check: `npm run typecheck`
- Tests: `npm run test`
- Production build: `npm run build`
- Mobile Android APK/AAB: follow `docs/mobile-android-build.md` and use
  `.codex\scripts\build-android.ps1` with a dedicated ASCII build directory.

For frontend verification after design changes, clear `.next` and restart the
dev server before browser checks when practical.

## Interaction-cost audits

For "왜 이 동작은 두 단계인가", "이 버튼을 왜 눌러야 하나", or a before/after comparison of a
flow change, read `.codex/skills/ux-flow-audit/SKILL.md` and score both paths with its
script. Lifecycle, state-truth and parity findings stay with the UX review guidance in
`docs/verification-checklist.md`; this skill supplies the measured cost (ΔM, seconds) that
severity claims cite. Score web and mobile separately.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
