# Aura-board — Architecture

단일 소스. 신규/수정 데이터 모델·API·컴포넌트 트리를 여기에 기록한다.

## Stack (lockdown)

- Next.js 16 App Router (Turbopack dev)
- React 19 + TypeScript 5
- Prisma 6 + PostgreSQL (Supabase, region ap-northeast-2)
- NextAuth 5 beta + Prisma Adapter
- Student session: custom HMAC cookie (`src/lib/student-auth.ts`)
- Realtime engine: Supabase Realtime for public student share shells. `src/lib/realtime.ts`는 legacy server route용 채널 키 helper/no-op adapter로 유지한다.

## Environment

- Public student share shells are static (`/s/[shortCode]`, `/share/[shareToken]`) and use `@supabase/supabase-js` directly in the browser.
- Required public client env: `NEXT_PUBLIC_SUPABASE_URL` plus `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Server-only media writes/deletes use Supabase Storage with `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL`.
- Do not expose `SUPABASE_SERVICE_ROLE_KEY` through `NEXT_PUBLIC_*`.

## Auth & RBAC

`src/lib/rbac.ts`
- `getBoardRole(boardId, userId)` — board-level role lookup.
- `requirePermission(boardId, userId, action)` — throws `ForbiddenError`.
- **`viewSection(sectionId, ctx)`** (T0-① 2026-04-12): section-scoped access gate. Allow paths:
  1. Matching `token` (constant-time compare).
  2. NextAuth user that is a board member.
  3. Student whose `classroomId` matches `board.classroomId`.

## Realtime

`src/lib/realtime.ts`
- `boardChannelKey(boardId)` → `board:{boardId}`
- `sectionChannelKey(boardId, sectionId)` → `board:{boardId}:section:{sectionId}`
- `assignmentChannelKey(boardId)` → `board:{boardId}:assignment` (AB-1, 2026-04-14)
- `publish(event)` is a no-op placeholder for legacy server routes. Public student share shells subscribe directly with Supabase Realtime and refetch board data on card/section changes.
- `AssignmentRealtimeEvent` union: `slot.updated` | `slot.returned` | `reminder.issued`.

## Data model

Relevant subset for Breakout T0-①:

```prisma
model Section {
  id          String  @id @default(cuid())
  boardId     String
  title       String
  order       Int     @default(0)
  accessToken String? @unique  // T0-① Breakout share token
  board Board  @relation(fields: [boardId], references: [id], onDelete: Cascade)
  cards Card[] @relation("SectionCards")
  @@index([boardId])
}
```

Migrations under `prisma/migrations/`:
- `20260412_add_perf_indexes` (earlier task)
- `20260412_add_section_access_token` (this task)

## API surface

| Method | Path | Notes |
|---|---|---|
| POST | `/api/sections` | create section (owner/editor) |
| PATCH | `/api/sections/:id` | edit title/order |
| DELETE | `/api/sections/:id` | delete (cards drop to sectionId=null) |
| **GET** | **`/api/sections/:id/cards?token=…`** | **T0-① section-scoped read. Calls `viewSection`; never scans by boardId.** |
| **POST** | **`/api/sections/:id/share`** | **T0-① owner-only; rotates `Section.accessToken` using `crypto.randomBytes(32).toString("base64url")`.** |
| **GET** | **`/api/boards/:id/stream`** | **2026-04-17 SSE. Polls cards+sections every 3s; emits `event: snapshot` only when sha1 of payload changes. Re-checks `view` permission every 60s. Keepalive `: ping` every 60s during quiet periods. Used by `ColumnsBoard` for live updates.** |

## Routes

| Path | Type | Notes |
|---|---|---|
| `/board/[id]` | server | teacher integrated view (unchanged) |
| **`/board/[id]/s/[sectionId]`** | **server** | **T0-① Breakout view. Scoped card query. Owner sees "공유 관리" link.** |
| **`/board/[id]/s/[sectionId]/share`** | **server** | **T0-① owner-only share page. Renders `<SectionShareClient>` island. 2026-04-13: fallback only (primary entry is BoardHeader ⚙ → `<BoardSettingsPanel>` 브레이크아웃 tab).** |

## Components

- `src/components/SectionBreakoutView.tsx` (server) — renders breadcrumb + `.breakout-grid` of `.column-card`s. Reuses `CardAttachments`.
- `src/components/SectionShareClient.tsx` (client island) — copy + rotate flow. Computes absolute URL post-mount to avoid hydration mismatch.
- `src/components/ui/SidePanel.tsx` (2026-04-13) — generic right-side slide-over dialog primitive. `role=dialog`, `aria-modal`, ESC, focus trap, body scroll lock, opener-focus restore, `prefers-reduced-motion` respected.
- `src/components/SectionActionsPanel.tsx` (2026-04-13, v2 relocation) — columns section management. 2 tabs (`이름 변경` / `삭제`) after the `공유` tab was relocated to the board-level settings panel. Rename calls `PATCH /api/sections/:id`. Delete requires checkbox confirm, calls `DELETE /api/sections/:id`.
- `src/components/BoardSettingsLauncher.tsx` + `src/components/BoardSettingsPanel.tsx` (2026-04-13, board-settings-panel task) — ⚙ button next to `EditableTitle` in `BoardHeader` (owner/editor only) opens a right-slide `SidePanel` titled "보드 설정". Tabs: `브레이크아웃` (per-section generate/rotate/copy, calls `POST /api/sections/:id/share` and `router.refresh()`), plus placeholders `접근 권한`, `Canva 연동`, `테마` ("준비 중"). Consolidated section ⋯ means rename/delete/Canva 액션 모두 `ContextMenu` 하나로 통합됨.
- `src/components/plant/StageDetailSheet.tsx` — refactored 2026-04-13 to wrap `SidePanel` (props unchanged). If `feat/plant-journal-v2` rewrites this file, take v2's version and re-apply the wrapper.

## Design tokens

See `docs/design-system.md`. T0-① Breakout surfaces introduce these utility classes only (no new tokens):
`.breakout-header`, `.breakout-breadcrumb`, `.breakout-grid`, `.breakout-empty`, `.share-panel`, `.share-label`, `.share-url-input`, `.share-actions`, `.share-help`, `.share-status`.

2026-04-13 section-actions-panel adds: `--color-danger`, `--color-danger-active`, and the `.side-panel-*`, `.section-actions-trigger`, `.section-rename-form`, `.section-delete-*` utility classes in `src/styles/side-panel.css`.

2026-04-13 board-settings-panel adds: `.board-settings-trigger`, `.board-settings-tab-meta`, `.board-settings-list`, `.board-settings-row`, `.board-settings-row-title`, `.board-settings-row-name`, `.board-settings-row-badge` (`.on`/`.off`), `.board-settings-empty`, `.board-settings-placeholder` — all in `src/styles/side-panel.css`, reusing existing tokens (no new design tokens). Note: `.section-actions-trigger` is now unused (section ⋯ uses the generic `.ctx-menu-trigger`); the class remains for backward compat until next cleanup.


## 2026-04-13 Drawpile 그림보드 (schema + UI stub, partial scope)

Status: schema + route + UI placeholder only. Drawpile 서버/포크/COOP-COEP/postMessage bridge 는 `BLOCKERS.md` 참조.

### Data model additions
- `StudentAsset` — 학생 소유 이미지(업로드 or Drawpile 생성). `studentId`, 비정규화 `classroomId`, `fileUrl`, `thumbnailUrl`, `format`, `sizeBytes`, `isSharedToClass`, `source` (`upload`|`drawpile`), `drawpileFileId?`. FK: Student cascade.
- `AssetAttachment` — StudentAsset ↔ Card / PlantObservation 조인. 둘 중 하나만 채움. Card/Observation cascade.
- 관계 추가: `Student.assets`, `Card.assetAttachments`(rel `"CardAssetAttachments"`), `PlantObservation.assetAttachments`(rel `"PlantObservationAssetAttachments"`).

### Routes
- `POST /api/student-assets` — 학생 세션 필수. multipart/form-data `file` (image/*, ≤50MB). `public/uploads/` 저장 (기존 `/api/upload` 와 동일 FS 패턴 — 영속성 업그레이드는 BLOCKERS.md #6).
- `GET /api/student-assets?scope=mine|shared[&classroomId=…]` — `mine`: 로그인 학생 본인. `shared`: 교사 owner or 해당 교실 학생.
- `POST /api/student-assets/[id]/attach` — body `{ cardId?, observationId? }`. 자산 owner 또는 board owner 에게만 허용. `cardId` 지정 + `Card.imageUrl === null` 일 때만 imageUrl 채움 (기존 업로드 이미지 보호).

### Layout wiring
- `Board.layout` app-level zod enum 에 `"drawing"` 추가 (`src/app/api/boards/route.ts`).
- `src/app/board/[id]/page.tsx` `LAYOUT_LABEL.drawing = "그림보드"` + `case "drawing"` → `<DrawingBoard />`.
- `CreateBoardModal` LAYOUTS 에 entry 추가.

### Components
- `src/components/DrawingBoard.tsx` — 작업실/갤러리 탭 토글. `NEXT_PUBLIC_DRAWPILE_URL` 있음 → `<iframe sandbox="allow-scripts allow-same-origin allow-forms allow-modals">`. 미설정 → placeholder card (`BLOCKERS.md` 가이드). 갤러리 탭: GET shared + `gallery-empty` 빈 상태.
- `src/components/StudentLibrary.tsx` — 학생 로그인 시에만 사이드바. GET mine + 업로드 버튼 + 썸네일 list.
- `AddCardModal` — `🎨 내 라이브러리` 버튼 + picker overlay. 선택 시 `imageUrl` set + `attachAssetId` 를 `AddCardData` 로 반출. `BoardCanvas.handleAdd` 가 카드 생성 후 fire-and-forget attach 호출.

### Styles
- `src/styles/drawing.css` (globals.css import) — `.drawing-board`, `.drawing-tabs`, `.drawing-panel`, `.drawing-iframe`, `.drawing-placeholder`, `.drawing-gallery`, `.gallery-thumb`, `.drawing-sidebar`, `.library-list`, `.library-picker*`. 768px breakpoint 에서 세로 스택.

### Migrations
- `prisma/migrations/20260413_add_drawpile_student_assets/migration.sql` (non-destructive). Supabase 수동 적용 필요 (`BLOCKERS.md` #5).

### Deferred (BLOCKERS.md)
1. Drawpile fork repo (GPL 격리)
2. Drawpile 서버 호스팅 + `drawpile.aura-board.app`
3. COOP/COEP 헤더 (drawing-only 라우트 전략)
4. postMessage bridge (`docs/drawpile-protocol.md`)
5. Supabase migration 적용
6. 프로덕션 Supabase Storage bucket/policy 적용

## Breakout Room Foundation (2026-04-12, BR-1 ~ BR-4)

### Data model
```prisma
model BreakoutTemplate {
  id, key (unique), name, description,
  tier ("free"|"pro"), requiresPro,
  scope ("system"|"teacher"|"school"), ownerId?,
  structure Json,             // {sectionsPerGroup:[{title,role,defaultCards?}], sharedSections?:[{title,role:"teacher-pool"}]}
  recommendedVisibility ("own-only"|"peek-others"),
  defaultGroupCount, defaultGroupCapacity
}

model BreakoutAssignment {
  id, boardId (unique), templateId,
  deployMode ("link-fixed"|"self-select"|"teacher-assign"),
  groupCount, groupCapacity, visibilityOverride?,
  status ("active"|"archived")
}

model BreakoutMembership {
  id, assignmentId, sectionId, studentId, role? ("expert"|"home"|null), joinedAt
  @@unique([sectionId, studentId])
}
```

관계 필드:
- `User.templatesOwned BreakoutTemplate[]` (`TemplateOwner`)
- `Section.breakoutMemberships BreakoutMembership[]`
- `Student.breakoutMemberships BreakoutMembership[]`
- `Board.breakoutAssignment BreakoutAssignment?`

### API
- `POST /api/boards` — `layout="breakout"` + `breakoutConfig` 시 단일 트랜잭션에서 Board + Assignment + N*S group sections + (sharedSections 있으면) teacher-pool section + defaultCards deep-clone 생성. Tier gating: `requiresPro && tier==="free"` → 403.
- `GET /api/breakout/templates` — 시스템 + 교사 커스텀 (ownerId 일치) 리스트.
- `POST /api/breakout/assignments/[id]/copy-card` — teacher(owner)-only, body `{sourceCardId}` → teacher-pool 제외 + origin section 제외 group section 전체에 독립 복사 INSERT.

### Components
- `src/components/CreateBreakoutBoardModal.tsx` — 3-step (template → config → confirm). Pro 템플릿은 Free 사용자에게 aria-disabled + 🔒 배지.
- `src/components/BreakoutBoard.tsx` — 교사 풀뷰. `parseGroupSection()` 으로 "모둠 N · 섹션명" 포맷 역파싱. teacher-pool 섹션은 상단 밴드 분리. 카드 ContextMenu에 🧬 "모든 모둠에 복제".
- `src/components/CreateBoardModal.tsx` — LAYOUTS에 `{id:"breakout", emoji:"👥"}` 추가 + `step="breakout"` 분기 → CreateBreakoutBoardModal 오픈.
- `src/app/board/[id]/page.tsx` — `case "breakout"` 렌더 분기 (BreakoutAssignment + template include 로딩).

### Libraries
- `src/lib/breakout.ts` — `TemplateStructureSchema` (zod), `cloneStructure()` (deep-clone 분리), `BreakoutConfigSchema`, `groupSectionTitle()`.
- `src/lib/tier.ts` — `getCurrentTier()` / `canUseTemplate()` stub. `process.env.TIER_MODE` 우선. BR-5~9에서 User.tier 필드로 교체.

### Seed
- `prisma/seed-breakout-templates.ts` — 8종 upsert(idempotent). `npm run seed:breakout`.

### Student 격리 뷰
- T0-① `/board/[id]/s/[sectionId]` 재사용. `Section.accessToken` 재마이그레이션 금지.
- BR-5에서 deployMode 별 진입 URL(token 포함) 배포 예정.

### Deferred → BR-5 ~ BR-9
- ~Deploy runtime~ — BR-5 완료
- ~Visibility WS gating~ — BR-6 완료
- ~Teacher assignment UI~ — BR-7 완료
- ~Student 명단 CSV import~ — BR-8 완료
- ~분석/통계~ — BR-9 완료

## Breakout Room Runtime (2026-04-12, BR-5 ~ BR-9)

### APIs
- `PATCH /api/breakout/assignments/[id]` — owner, body `{deployMode?, visibilityOverride?, groupCapacity?, status?}` (zod 검증)
- `POST /api/breakout/assignments/[id]/membership` — 학생 self-insert 또는 교사 대리. 정원 check + @@unique → 400/409. self-select 모드는 2회차 시도 시 409 `already_selected`.
- `PATCH /api/breakout/assignments/[id]/membership/[mid]` — owner, 섹션 이동 + 정원 check
- `DELETE /api/breakout/assignments/[id]/membership/[mid]` — owner
- `GET /api/breakout/assignments/[id]/my-access` — 호출자(teacher/student) 기준 허용 섹션 id + realtime 채널 key 리스트 반환 (`boardChannelKey` / `sectionChannelKey`)
- `POST /api/breakout/assignments/[id]/roster-import` — owner, multipart `file=<csv>` (name/number 헤더), Student upsert, 반환 `{created, existing, failed}`

### RBAC
- `src/lib/rbac.ts#assertBreakoutVisibility({sectionId, boardId, userId?, studentId?, token?})` — breakout 보드일 경우 추가 가드. 교사/매치 토큰은 통과, 학생은 own-only(자기 멤버십 sectionId) / peek-others(모든 group section) / teacher-pool(상시 허용).
- `src/lib/rbac.ts#maybeAutoJoinLinkFixed({assignmentId, sectionId, studentId})` — link-fixed 모드 한정 멱등 upsert. 정원 초과 시 `capacity_reached`.
- 섹션 진입점 (`/board/[id]/s/[sectionId]`, `/api/sections/[id]/cards`) 모두 viewSection → assertBreakoutVisibility 순서 호출.

### Pages / Components
- `src/app/b/[slug]/select/page.tsx` — 학생 self-select 그리드 + 정원 표시
- `src/app/board/[id]/archive/page.tsx` — 교사 전용 읽기 전용 모둠별 요약 테이블 + 최종 카드 스냅샷
- `src/components/BreakoutSelectClient.tsx` — 선택 버튼 + 409/정원초과 에러 메시지
- `src/components/BreakoutAssignmentManager.tsx` — 교사 대시보드 모달: 미배정 학생 리스트, 모둠별 배정/이동/제거, link-fixed 링크 복사, CSV 업로드
- `src/components/BreakoutBoard.tsx` — "배정 관리" / "세션 종료" / "아카이브" 툴바 + 모둠별 멤버 리스트 + 정체 경고 + deploy-mode/visibility 배지
- `src/components/SectionBreakoutView.tsx` — `autoJoinWarning` prop (link-fixed capacity_reached 경고)

### 배포 모드 동작 요약
| 모드 | 진입 경로 | 멤버십 생성 시점 |
|---|---|---|
| link-fixed | 교사가 배포한 `/board/[id]/s/[sectionId]?t=<token>` | 섹션 방문 시 auto-upsert |
| self-select | 교사가 공유한 `/b/[slug]/select` | 학생 클릭 1회 |
| teacher-assign | 교사가 드래그/버튼 배정 | 교사 액션 즉시 |

### 가시성 모드 요약
| 모드 | 학생 접근 |
|---|---|
| own-only | 본인 membership.sectionId + teacher-pool 섹션만 |
| peek-others | 전체 group section + teacher-pool |
| teacher | 항상 full (owner/editor) |
- 실제 Tier 결제 모델 (User.tier 필드)

## Assignment board (AB-1) — 2026-04-14

**Entity**: `AssignmentSlot` (roster-bound, 1 row per student at creation). See `tasks/2026-04-14-assignment-board-impl/phase3/data_model.md` for the full DSL.

**State machine** (`src/lib/assignment-state.ts` — 24 unit tests):

```
submissionStatus: assigned → submitted → viewed → {returned,reviewed} ; any → orphaned
gradingStatus:    not_graded → {graded, released}  (resets to not_graded on returned)
```

**API surface**:

| Method | Path | Role |
|---|---|---|
| POST | `/api/boards` `layout=assignment` | teacher |
| GET | `/api/boards/[id]/assignment-slots` | teacher (all) / student (own 1) / parent (scope) |
| PATCH | `/api/assignment-slots/[id]` | teacher — `{transition: open|return|review|grade}` |
| POST | `/api/assignment-slots/[id]/submission` | student — `canStudentSubmit()` gated |
| POST | `/api/boards/[id]/reminder` | teacher — 5-min per-board cooldown |
| POST | `/api/boards/[id]/roster-sync` | teacher — add new students post-creation |

**RBAC**: 3-layer (API guard + DOM filter at server component + RLS scaffold `prisma/migrations/20260414_add_assignment_slot/rls.sql` NOT auto-applied).

**Perf budget** (Galaxy Tab S6 Lite — AC-14, measurement pending hardware): DOM ≤ 180, TTI ≤ 3s, scroll FPS ≥ 45. Design: `memo(AssignmentGridView)`, CSS grid layout, `loading="lazy"` 160×120 img, no realtime subscription loops.

**Deferred**: WebP thumbnail pipeline (sharp), Matrix view server guard (`?view=matrix`).

## DJ Board (dj-queue) — 2026-04-18

Spotify-style sequential YouTube queue + **classroom role system** foundation. 사서/은행원 등 향후 역할로 일반화되는 data-driven RBAC.

### Data model additions

3 new models (`ClassroomRoleDef`, `BoardLayoutRoleGrant`, `ClassroomRoleAssignment`) + 1 new column (`Card.queueStatus`). Additive migration `20260418_dj_board_role_grants` with idempotent seed (dj role + (dj, dj-queue)→owner grant).

### RBAC extension

`src/lib/rbac.ts` → **`getEffectiveBoardRole(boardId, {userId?, studentId?})`** 신규.

Precedence:
1. userId → `getBoardRole` (기존 BoardMember 경로) — teacher always wins
2. studentId + student.classroomId === board.classroomId → `BoardLayoutRoleGrant` JOIN `ClassroomRoleAssignment` → grantedRole OR viewer fallback
3. 그 외 → null

기존 `getBoardRole` / `requirePermission` (17개 legacy callers) 불변. 신규 함수는 DJ queue API + SSE stream + board page role 해석에서만 사용.

### API surface

신규: `POST/PATCH/DELETE /api/boards/:id/queue[/:cardId[/move]]`, `GET/POST/DELETE /api/classrooms/:id/roles[/assign[/:id]]`.
수정: `POST /api/boards` (layout +dj-queue, classroomId required), `GET /api/boards/:id/stream` (student session + CardWire.queueStatus).

### YouTube validation (src/lib/youtube.ts)

- Host allowlist: `youtube.com` / `www.youtube.com` / `m.youtube.com` / `youtu.be`
- URL patterns: `/watch?v=<11-char>`, `/shorts/<11-char>`, `youtu.be/<11-char>`
- oEmbed fetch with 24h Next.js cache. 실패 시 400 반환.

### Components

`DJBoard` shell + `dj/{DJNowPlayingHeader, DJQueueList, DJQueueItem, DJSubmitForm, DJEmptyState}`. 교사용 `classroom/ClassroomDJRolePanel`. `CardData`에 `queueStatus?: string | null` 추가. `CreateBoardModal.LAYOUTS`에 `dj-queue` 항목. `/board/[id]/page.tsx` switch에 `case "dj-queue"` 추가. `/classroom/[id]/page.tsx` 하단에 DJ 패널 plug-in.

### Extensibility

새 역할-보드 쌍 추가는 **DB row 2개**로:
```sql
INSERT INTO "ClassroomRoleDef" (id, key, labelKo, emoji) VALUES (cuid(), 'librarian', '사서', '📚');
INSERT INTO "BoardLayoutRoleGrant" (id, classroomRoleId, boardLayout, grantedRole)
VALUES (cuid(), (SELECT id FROM "ClassroomRoleDef" WHERE key='librarian'), 'librarian-shelf', 'editor');
```

**Deferred**: 실제 YouTube iframe 동기 재생 (WebRTC), 투표 기반 우선순위, 범용 역할 관리 패널, 키보드 드래그 a11y.

## Classroom Bank (2026-04-19)

학급 경제 시뮬레이션: 통장 · 체크카드 · 30일 만기 적금 · 매점 카드 결제. 기존 classroom-role 시스템에 `banker`, `store-clerk` 역할 추가 + 교사 편집 가능한 권한 매트릭스.

### IA
`/classroom/:id` → `/classroom/:id/students` 리다이렉트. 상단 `ClassroomNav`: `/students /boards /roles /bank /store /pay`. 학생용 `/my/wallet`.

### Data model (7 new)
`ClassroomCurrency`, `StudentAccount`, `StudentCard`, `StoreItem`, `FixedDeposit`, `Transaction` (balanceAfter 감사 체인), `ClassroomRolePermission`. Migration `20260419_classroom_bank` + banker/store-clerk seed.

### Libs
- `src/lib/bank-permissions.ts` — PERMISSION_CATALOG 6 keys + `hasPermission` (teacher win → explicit override → default catalog)
- `src/lib/qr-token.ts` — HMAC 60s tokens + 15min nonce cache
- `src/lib/bank.ts` — `ensureAccountFor` / `ensureClassroomCurrency` lazy

### API (14 new)
bank {deposit, withdraw, fixed-deposits [open/cancel], overview}; store {items CRUD, charge}; role-permissions {GET, PUT per-role}; currency PATCH; my/wallet {GET, card-qr}; cron/fd-maturity.

### Concurrency
잔액 mutation 전부 `db.$transaction` 내부에서 findUnique → check → update → Transaction.create. Prisma READ COMMITTED 기본. phase8 security_audit.md 참조.

### Cron
`vercel.json` `/api/cron/fd-maturity` @ `5 15 * * *` UTC (00:05 KST). CRON_SECRET bearer 인증.

**Deferred**: 카메라 QR 스캐너 lib, Redis nonce, 학생 간 이체, Apple/Google Wallet Pass, 3분할 지갑.

## Vibe Coding Arcade — Seed 13 (2026-04-20)

`Board.layout="vibe-arcade"` 신규 레이아웃. 교사 Sonnet 쿼터 잉여분을 학생 바이브 코딩 예산으로 전환하는 학급 Steam.

### Data model (6 new)

Migration `20260420_vibe_arcade_v1`. 기존 테이블 column 수정 0 → zero-downtime:

- `VibeArcadeConfig` — `Board` 1:1 (`boardId` PK, onDelete Cascade). 7 설정 필드 + `enabled` gate(FeatureFlag 테이블 대신 흡수).
- `VibeProject` — 학생 HTML 아티팩트. `authorStudentId` onDelete **Restrict**(작품 보존). indexes `(boardId, moderationStatus)` · `(classroomId, moderationStatus, createdAt)` · `(authorStudentId)`.
- `VibeSession` — Sonnet 대화. `studentId String?` + onDelete **SetNull**(7일 익명화 cron). `messages Json`.
- `VibeReview` — `@@unique([projectId, reviewerStudentId])`. `flagCount >=3` → `moderationStatus="hidden_by_teacher"` (application-level).
- `VibePlaySession` — 플레이 원장. postMessage `{type:"completed"}` 수신 시 `uniquePlayCount` 조건부 증가.
- `VibeQuotaLedger` — `studentId String` non-null + 센티넬 `"__CLASSROOM__"`로 학급 합계 행 구분. `@@unique([classroomId, studentId, date])`. Postgres NULL-distinct 회피.

### Libs

- `src/lib/vibe-arcade/types.ts` — Zod 스키마 6종 + realtime event union(`project.created/.approved/.rejected/.flagged` · `review.created` · `quota.updated`).
- `src/lib/vibe-arcade/moderation-filter.ts` — `scanText`(욕설 + 전화/주민/이메일) · `scanHtml`(iframe/object/embed tag + javascript:/data:text/html scheme + 외부 URL 화이트리스트).
- `src/lib/vibe-arcade/iframe-lru.ts` — module-level singleton LRU cap 3, about:blank 언마운트 (Seed 5 승계).
- `src/lib/vibe-arcade/quota-ledger.ts` — `kstDate()` + `checkQuotaOrReject()` + `incrementLedger()` (`$transaction` upsert 2건). `CLASSROOM_WIDE_SENTINEL` export.
- `src/lib/vibe-arcade/sandbox-renderer.ts` — CSP `sandbox`·`frame-src 'none'`·CDN 화이트리스트 헤더 + postMessage bridge. `escapedTitle`로 XSS 차단.
- `src/lib/vibe-arcade/sonnet-provider.ts` — Anthropic SDK(`@anthropic-ai/sdk`) dynamic import + SSE stream + refusal/stop_reason 처리. 기본 모델 `claude-sonnet-4-6`(Haiku 다운그레이드 금지).
- `src/lib/vibe-arcade/play-token.ts` — HMAC-SHA256 + base64url + `timingSafeEqual` + 1h TTL.

### API (9 handler + 1 sandbox + 3 cron)

| Method | Path | Role |
|---|---|---|
| GET · PATCH | `/api/vibe/config?boardId=X` | member(GET) / owner-editor(PATCH). 404 on missing board |
| GET | `/api/vibe/projects?boardId&tab&tag` | classroomId scope 검증(student) + board role(user) |
| POST | `/api/vibe/projects` | session 소유 student. `scanHtml` 통과 + `moderationStatus="pending_review"` 기본 |
| POST | `/api/vibe/sessions` | SSE stream. `checkQuotaOrReject` 선행 + `req.signal` abort 지원 |
| POST | `/api/vibe/reviews?projectId=X` | student not-author, classroom 매칭. self-flag/self-review 차단 |
| POST | `/api/vibe/reviews/:id/flag` | student not-self. `flagCount>=3` → hidden |
| POST | `/api/vibe/play-sessions` | student. `issuePlayToken(projectId, playSessionId)` 발급 |
| PATCH | `/api/vibe/play-sessions/:id` | student. `$transaction` 내 `playCount++` + 조건부 `uniquePlayCount++` |
| POST | `/api/vibe/moderation/:projectId` | owner/editor. approve/reject + note(reject 필수) |
| GET | `/api/vibe/quota?boardId=X` | owner/editor. 학급 풀 + 학생별 내림차순 |
| GET | `/sandbox/vibe/:projectId?pt=TOKEN` | **cross-origin `sandbox.aura-board.app`**. HMAC verify + project 조회 + CSP wrapped HTML |
| GET | `/api/cron/vibe-arcade-{quota-rollup,anonymize,hard-delete}` | `x-vercel-cron` / `CRON_SECRET` |

### Realtime
- Channel: `board:${boardId}:vibe-arcade`
- `publish()`는 기존 `src/lib/realtime.ts` placeholder 승계 — 엔진 swap 시 본 feature 무영향.

### Components (현재 = 뼈대)

- `src/components/VibeArcadeBoard.tsx` (client) — layout root. Board `layout="vibe-arcade"` 분기(`src/app/board/[id]/page.tsx`).
- `src/components/vibe-arcade/StarRating.tsx` — radiogroup, 3 sizes, SVG stars.
- `src/styles/vibe-arcade.css` — v2 Notion Soft, 토큰 99% 재사용.

### 신규 design tokens (`src/styles/base.css`)

7건 — alias 3개 포함 (quota-ok=plant-active · quota-danger=danger · chat-user-bg=accent-tinted-bg). 순신규 4개(rating amber · rating-empty · quota-warn · sandbox-bg #1a1a1a).

### Deferred (phase7 후속 세션)

VibeCodingStudio · PlayModal · ReviewPanel · TeacherModerationDashboard · 8 UI primitives · Playwright 썸네일 워커 · 교사 API Key DB 암호화 · Upstash rate limit · Slack 경보 · iframe postMessage origin 검증 클라(AC-N9).

### Feature gate
`VibeArcadeConfig.enabled` Boolean (기본 false). Pro tier 전용. `crossClassroomVisible` false 기본.

## Student Portfolio + Showcase (student-portfolio) — 2026-04-26

학생들이 학급 친구 결과물을 한 곳에 모아 보고, 학생 본인이 자기 카드 중
잘된 것을 학급 메인화면에 옵트인으로 띄울 수 있는 자랑해요 채널.
학부모는 자녀 본인 카드 + 학급 자랑해요만 노출.

### Data model
- **`ShowcaseEntry`** (신규): `cardId`, `studentId`, `classroomId`, `createdAt`. `@@unique([cardId, studentId])` — 한 학생 한 카드 1슬롯. classroomId denorm 으로 학급 highlight 쿼리 가속. `Card`, `Student` 양쪽에 reverse relation.
- 기존 `Card`/`Student` 컬럼 무변경. 마이그레이션 `20260426_showcase_entry` (zero-downtime).

### Permission model
- `src/lib/portfolio-acl-pure.ts` — pure 함수 (단위 테스트 가능). `canViewStudent`, `canViewClassroomShowcase`, `canToggleShowcase`.
- `src/lib/portfolio-acl.ts` — `resolvePortfolioViewer()` (server-only). teacher → parent → student 순 (NextAuth user 가 학생 cookie 보다 우선).
- 3 viewer kind:
  - **student**: 자기 학급 학생 명단만, 본인 작성/공동작성 카드만 자랑해요 토글 가능
  - **parent**: 활성 ParentChildLink 자녀 본인 카드 + 자녀 학급의 자랑해요만
  - **teacher_owner**: 자기 학급 (Classroom.teacherId 매칭)

### API (5 신규 + 1 channel helper)

| Method | Path | Role |
|---|---|---|
| GET | `/api/student-portfolio/roster?classroomId=X` | student/parent/teacher 학급 boundary 검증 |
| GET | `/api/student-portfolio/:studentId` | canViewStudent gate. include board/section/attachments/showcaseEntries (N+1 방지) |
| POST | `/api/showcase` body `{cardId}` | student session only. transaction COUNT 한도 3 검증. 초과 시 409 + 현재 자랑해요 카드 응답 |
| DELETE | `/api/showcase?cardId=X` | student session, 본인 슬롯만 |
| GET | `/api/showcase/classroom/:classroomId` | LIMIT 30 학급 자랑해요 chronological |
| GET | `/api/parent/portfolio?childId=X` | parent only. 자녀 카드 + 자녀 학급 자랑해요. AC-8 학부모 leak 0건 보장 |

`classroomShowcaseChannelKey(classroomId)` — `src/lib/realtime.ts` 신규 헬퍼. `publish()` 는 no-op 승계 (엔진 미정).

### Routes
- `/student/portfolio` — 좌측 학급 학생 리스트 + 우측 카드 그리드 (2-pane peer roster)
- `/student` (수정) — 상단 ShowcaseHighlightStrip + 포트폴리오 CTA
- `/parent/(app)/child/[studentId]/portfolio` — 자녀 카드 + 학급 자랑해요 (ChildTabs "포트폴리오" 탭 추가)

### Components (`src/components/portfolio/`)

- `PortfolioPage` — 컨테이너, 모바일 stack 분기
- `PortfolioRoster` — 좌측 학생 리스트 (출석번호 ASC, 본인 🟢 강조)
- `PortfolioStudentView` — 우측 카드 그리드 + 빈상태/로딩/에러
- `PortfolioCardItem` — CardBody 재사용 + 출처 라벨 + 🌟 배지 + 컨텍스트 메뉴
- `ShowcaseHighlightStrip` / `ShowcaseCardChip` — 학급 dashboard 가로 carousel
- `ShowcaseLimitModal` — 4번째 토글 시 "내릴 카드 1개 선택" 모달
- `ParentPortfolioView` — 자녀 카드 + 학급 자랑해요 통합
- `useShowcaseToggle` — 낙관적 + 409 한도 모달 트리거 훅
- `source-label.ts` — 출처 라벨 빌더 (`columns` 면 `보드·칼럼`, 그 외 `보드`)

### Design tokens (1 alias)

| 토큰 | 값 | 용도 |
|---|---|---|
| `--color-showcase` | `var(--color-vibe-rating)` (#f5a623) | 🌟 자랑해요 배지·strip 헤더 |

신규 hex 0개. itch.io/Steam 별점 amber 와 시맨틱 일관(주목·하이라이트).

### 한도·정책
- 자랑해요 학생당 **최대 3개** (상수 `SHOWCASE_LIMIT_PER_STUDENT` in `src/app/api/showcase/route.ts`)
- 카드 삭제 시 ShowcaseEntry 자동 cascade (`onDelete: Cascade` 양쪽)
- 공동작성자(R4): `Card.authors` 또는 `studentAuthorId` 어느 쪽이든 본인 매칭이면 토글 가능. 한 카드에 학생별 별도 슬롯
- 교사 모더레이션 / 좋아요·댓글 / 검색·필터 → v2

### 회귀 테스트
- `src/lib/__tests__/portfolio-acl.vitest.ts` — 12 테스트 (권한 매트릭스 student/parent/teacher × view/showcase)
- `src/components/portfolio/__tests__/source-label.vitest.ts` — 4 테스트 (출처 라벨 4 분기)

### 알려진 한계
- Realtime publish no-op → 자랑해요 토글 즉시 다른 탭 반영 X. 진입 시 fetch 로 fallback
- 자랑해요 한도 race 잠재 (Prisma SELECT FOR UPDATE 미지원). 클라이언트 busy state + transaction COUNT 가드. 멀티 디바이스 race 발생 시 hotfix (SERIALIZABLE 격리 또는 raw INSERT WHERE COUNT<3) 가능

## Parent Redesign — OAuth + 통합 대시보드 (parent-redesign) — 2026-04-26

학부모 매직링크 인증 → OAuth(Google + Kakao) 추가. 자녀 페이지 6탭
(portfolio·plant·drawing·assignments·events·breakout) 을 portfolio 1개로
통합한 대시보드. 학급 자랑해요 진입점 추가.

### Data model
- **`ParentOAuthAccount`** 신규: `parentId` `provider` (google/kakao) `providerAccountId` `email?` `emailVerified` `displayName?` `profileImage?` `(provider, providerAccountId)` unique. parentId+email index. 마이그레이션 `20260426_parent_oauth_account` zero-downtime.
- 기존 `Parent` 무변경 (email 매칭으로 OAuth account link).

### Auth library
- **arctic@^3.7.0** — Lucia 기반 OAuth 클라이언트. Google + Kakao provider. NextAuth 와 별도 (학부모 = Parent 모델 + ParentSession 쿠키, 교사 = NextAuth User).
- **State cookie**: `parent-oauth-state.ts` (pure) HMAC-SHA256 sign + 10분 TTL + timingSafeEqual 검증. 8 unit tests.
- **Account linking** (`upsertParentFromOAuth`):
  1. `(provider, providerAccountId)` 매칭 → 기존 link 사용
  2. verified email 매칭 → 기존 Parent 에 신규 ParentOAuthAccount link
  3. 신규 Parent + ParentOAuthAccount (email 없으면 placeholder `oauth-{provider}-{id}@noemail.aura.local`)

### API
| Method | Path | Role |
|---|---|---|
| GET | `/api/parent/auth/{provider}` | 누구나. state cookie + 302 to provider authorization |
| GET | `/api/parent/auth/callback/{provider}` | code → token 교환 + user info + upsert + ParentSession 발급 + redirect |

### Routes
- `/parent/(app)/home` 풀 재설계: 풀폭 헤더(DJ 패턴) + 자녀 chip 셀렉터 + ParentPortfolioView 본문 + 자랑해요/자녀 추가 액션
- `/parent/(app)/showcase` 신규: ShowcaseGalleryView 학급 자랑해요 그리드 (`/student/showcase` 등가)
- `/parent/(app)/child/[id]/{plant,drawing,assignments,events,breakout}` 5개 → redirect /parent/home (backwards safety)
- `/parent/(app)/child/[id]/portfolio` 유지
- `/parent/(app)/child/[id]/page.tsx` redirect → /parent/home?child=ID
- `/parent/onboard/signup` UI 갱신: ParentAuthButtons 우선 + "이메일 매직링크" 토글 fallback

### Components
- `<ParentDashboard />` — 풀폭 헤더 + 자녀 셀렉터 + portfolio 본문, URL ?child=ID + localStorage 복원
- `<ParentChildSelector />` — 자녀 1명: 정적 chip / ≥2명: dropdown (listbox role + 키보드 + outside click)
- `<ParentAuthButtons />` — Google + Kakao SVG icon 버튼
- (재사용) `<ParentPortfolioView />` `<ShowcaseGalleryView />` `<PortfolioCardModal />`
- `<ChildTabs />` 삭제

### Design tokens (2 신규)
| 토큰 | 값 | 용도 |
|---|---|---|
| `--color-oauth-google` | `#4285F4` | Google brand icon strip |
| `--color-oauth-kakao` | `#FEE500` | Kakao brand 배경 |

### Environment
4개 env 추가 필요 (사용자 작업): `GOOGLE_PARENT_CLIENT_ID/SECRET`,
`KAKAO_PARENT_CLIENT_ID/SECRET`, `PARENT_OAUTH_REDIRECT_BASE_URL`.
미설정 시 OAuth 버튼 disabled + 매직링크 fallback.

### 회귀 테스트
- `parent-oauth-state.vitest.ts` 8 tests (HMAC sign/verify + 만료 + 위조 + 형식)

### 알려진 한계
- 라이브 OAuth flow 자동 검증 불가 (외부 provider 응답 필요). 코드 + 단위 테스트로 대체.
- placeholder email 도메인 (`@noemail.aura.local`) 발송 시 bounce — 별도 task 로 발송 path skip 처리 필요
