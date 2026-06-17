# Current Features — Aura-board

Live feature inventory. Update when merging feature tasks.

## Board layouts
| Layout | Description |
|---|---|
| `freeform` | 카드 보드 — 칼럼 없이 카드 나열 |
| `grid` | 그리드 정렬 |
| `stream` | 세로 피드 |
| `columns` | 칼럼(Kanban) — SSE 라이브 동기화 + 칼럼별 정렬(manual/newest/oldest/title, 2026-04-17) |
| `assignment` | 과제 배부 + 제출 (AB-1 rewrite 2026-04-14: AssignmentSlot entity — roster-bound 5×6 grid, full-screen review modal, inline return reason, identity-based teacher/student/parent scope) |
| `quiz` | 실시간 퀴즈 |
| `plant-roadmap` | 식물 관찰일지 세로 타임라인 (2026-04-12 PJ-1~6, 2026-04-13 v2) |
| `drawing` | Drawpile 공동 그림판 + 학생 라이브러리 (2026-04-13, **schema + UI stub only** — 서버 배포 대기, `BLOCKERS.md`) |
| `breakout` | 모둠 학습 보드 (2026-04-12, foundation BR-1~BR-4) — 8종 템플릿(Free 3 + Pro 5), N모둠 × S섹션 자동 복사, teacher-pool 공용 섹션, "모든 모둠에 복제" 일괄 액션 |
| `dj-queue` | DJ 큐 (2026-04-18) — YouTube 곡 대기열, classroom-role 학생 DJ가 교사와 동등한 순서·승인 권한. Now-Playing pinned + 단일 세로 큐 + status pill (pending/approved/played/rejected) |
| `vibe-arcade` | 학급 Steam (2026-04-20, Seed 13 v1) — 학생이 Claude Sonnet과 대화해 브라우저 실행 HTML 게임·퀴즈를 만들고 반 친구들이 cross-origin 샌드박스에서 플레이·리뷰. 현재 스코프: **backend + 카탈로그/게이트오프 UI 뼈대**. Studio/PlayModal/ReviewPanel/TeacherModerationDashboard UI는 phase7 후속 세션. `VibeArcadeConfig.enabled` gate 기본 false. |

## Classroom & Student
- 교사 `Classroom` 생성/수정 + 6-char classroom code
- `Student` 목록, QR + textCode 로그인, session cookie(HMAC)

## Plant Journal (2026-04-12)
- 10종 식물 카탈로그(`PlantSpecies` + `PlantStage`) — 토마토/딸기/해바라기/메리골드/무/상추/강낭콩/오이/고추/팬지
- 교사 `ClassroomPlantAllow`로 학급별 허용 종 제어
- 학생 `StudentPlant`: (board,student) 고유, 별명 1~20자, 단계 진행
- `PlantObservation` 사진 ≤10장 + 메모 ≤500자, 선택적 noPhotoReason
- 단계 역행 불가(자기 선언 advance만), 사진 0 + 사유 없음 → 400
- 교사 요약 뷰 (분포 badge + 학생 list + 7일+ 정체 경고)
- 교사 매트릭스 뷰 (보조 링크로 격하, owner + desktop≥1024, 칼럼 virtualization)

### v2 (2026-04-13)
- 학생 로드맵 레이아웃: 가로 지하철 → **세로 타임라인** (좌측 레일 + 각 단계 우측 인라인 관찰 카드). `StageDetailSheet`는 학생 플로우에서 제거됨 (파일은 보존).
- 교사 드릴다운 라우트: `/board/[id]/student/[studentId]` (board owner 전용, server component, 403 on non-owner).
- 교사가 요약 뷰 학생 행 클릭 → 해당 학생 로드맵을 편집 모드(`canEdit + editAnyStage`)로 열어 관찰 추가/수정/삭제 + 단계 이동.
- `PATCH /api/student-plants/[id]` (신규, nickname 수정) — student owner + classroom teacher 허용.
- `POST/PATCH/DELETE /api/student-plants/[id]/observations[...]` + `advance-stage` — classroom teacher 허용으로 완화.

## Auth
- NextAuth v5 + Google OAuth (teacher)
- 쿠키 기반 student session (qrToken/textCode)
- Dev mock auth (`as=owner|editor|viewer` cookie)

## Canva
- OAuth + iframe oEmbed + PDF export

## Section Actions Panel (2026-04-13)
- columns 보드 섹션 헤더 `⋯` 버튼 → ContextMenu 드롭다운 (owner/editor 노출)
  - 메뉴: **이름 변경**, **섹션 삭제**(danger), **Canva에서 가져오기**, (Canva 링크 존재 시) **PDF 내보내기** / **Canva 폴더로 정리**
  - rename/delete 선택 시 `SectionActionsPanel`(이름 변경 / 삭제 2탭) 오픈
- 신규 범용 프리미티브: `src/components/ui/SidePanel.tsx`
- `plant/StageDetailSheet` 는 동일 `SidePanel` 을 사용하도록 리팩터 (props 시그니처 불변)

## External API / Personal Access Tokens (2026-04-13, P0-②)
- `POST /api/external/cards` — Canva 콘텐츠 퍼블리셔 등 외부 통합이 교사 토큰으로 카드 생성
  - `Authorization: Bearer aura_pat_…` — 교사가 발급한 PAT
  - zod 검증: `boardId`, `title` 필수 / `content`, `imageDataUrl`(PNG data URL ≤5MB), `linkUrl`, `canvaDesignId` 선택
  - RBAC: board owner/editor만 허용, viewer → 403
  - Rate limit: 토큰당 60/min (in-memory fixed window)
  - 이미지: Supabase Storage 업로드. 로컬 개발에서 Supabase Storage 미설정 시 `public/uploads/` fallback
  - Canva designId → 서버측 oEmbed 자동 보강(linkImage/linkTitle/linkDesc)
- 교사 UI: `/account/tokens` — 발급 (라벨) / 리스트 (`lastUsedAt`) / 폐기
  - 평문 토큰 1회 노출 (DB 는 SHA-256 해시만 저장, 키=`NEXTAUTH_SECRET`)
  - 계정당 활성 토큰 최대 10개 → 초과 시 `token_limit_exceeded`
- `POST /api/account/tokens` (발급), `DELETE /api/account/tokens/[id]` (폐기) — NextAuth 세션 필요
- 신규 모델: `ExternalAccessToken { id, userId, name, tokenHash, lastUsedAt, revokedAt, createdAt }`
- 문서: [docs/external-api.md](./external-api.md)
- 블로커(외부 범위): Canva Apps SDK 프로젝트 + Developer Portal 등록은 사용자 외부 수행

## Board Settings Panel (2026-04-13)
- 보드 헤더 `제목` 우측 **⚙ 버튼** — owner/editor 전용
- 클릭 시 `BoardSettingsPanel` 우측 슬라이드 (`SidePanel` primitive 재사용)
- 탭:
  - **브레이크아웃** — 보드 섹션 리스트 + 각 행 링크 **생성/재발급/복사** (`POST /api/sections/:id/share` 재사용, 낙관적 UI + `router.refresh()`). layout != columns 또는 섹션 0개 시 빈 상태 노출
  - **접근 권한 (준비 중)**, **Canva 연동 (준비 중)**, **테마 (준비 중)** — 플레이스홀더
- `/board/[id]/s/[sectionId]/share` 라우트는 하위 호환 fallback 으로 유지 — 배너가 "⚙ 보드 설정 → 브레이크아웃" 경로로 안내

## 모둠 학습 보드 — Foundation (2026-04-12, BR-1 ~ BR-4)
- 신규 엔티티 3종: `BreakoutTemplate`, `BreakoutAssignment`, `BreakoutMembership`
- 시스템 템플릿 8종 (`prisma/seed-breakout-templates.ts` · `npm run seed:breakout` 멱등):
  - Free: KWL 차트 · 브레인스토밍 · 아이스브레이커
  - Pro: 찬반 토론 · Jigsaw · 모둠 발표 준비(peek) · 갤러리 워크(peek) · 6색 모자
- `POST /api/boards` 확장: `layout="breakout"` + `breakoutConfig` → 단일 트랜잭션으로 Board + Assignment + N*S group sections + 1 teacher-pool section + defaultCards 생성
- 독립 복사 원칙: 템플릿 `structure`는 개설 시점에 `JSON.parse(JSON.stringify())`로 deep clone → 템플릿 원본 수정이 기존 Board로 역전파되지 않음
- `GET /api/breakout/templates` — 시스템 + 교사 커스텀 템플릿 리스트
- `POST /api/breakout/assignments/[id]/copy-card` — 교사(owner) 전용 일괄 복제, teacher-pool + origin section 제외
- Tier gating stub: `src/lib/tier.ts` (`process.env.TIER_MODE`) — BR-5~9에서 `User.tier` 필드로 swap
- UI: `CreateBreakoutBoardModal` (3-step: 템플릿/구성/확인) + `BreakoutBoard` 교사 풀뷰 (모둠 N개 grid + 카드 컨텍스트 메뉴)
- 학생 격리 뷰: T0-① `/board/[id]/s/[sectionId]` 재사용

## 모둠 학습 보드 — Runtime (2026-04-12, BR-5 ~ BR-9)
- **BR-5 배포 모드 런타임**:
  - `link-fixed`: 교사가 섹션 링크 배포 → 학생 방문 시 `maybeAutoJoinLinkFixed` 자동 upsert
  - `self-select`: 학생이 `/b/[slug]/select`에서 모둠 선택 (초기 1회만, 변경은 교사 승인)
  - `teacher-assign`: 교사 대시보드에서 반 학생 → 모둠 배정
  - APIs: `PATCH /api/breakout/assignments/[id]` (deployMode/visibility/status/capacity), `POST/PATCH/DELETE /api/breakout/assignments/[id]/membership[/mid]` (정원 check + force override)
- **BR-6 가시성 WS 게이팅**:
  - `src/lib/rbac.ts#assertBreakoutVisibility` — own-only/peek-others + teacher-pool 섹션 분기
  - 섹션 진입 + `/api/sections/[id]/cards` 2경로 모두 게이트 통과
  - `GET /api/breakout/assignments/[id]/my-access` — 학생별 허용 섹션 + 채널 key 리스트 (WS 엔진 도입 시 그대로 사용)
- **BR-7 교사 대시보드**: `BreakoutAssignmentManager` 모달 — 미배정 학생 리스트 + 모둠별 배정 + 이동/제거 버튼 + link-fixed 링크 복사 + 정체 경고
- **BR-8 CSV 로스터 import**: `POST /api/breakout/assignments/[id]/roster-import` (multipart) — name/number 헤더 기반 Student upsert, classroom-scoped
- **BR-9 아카이브**: `PATCH status="archived"` + `/board/[id]/archive` 서버 컴포넌트 — 모둠별 카드 수 / 활동 학생 수 / 최근 활동 / 최종 카드 스냅샷
- **v2 파킹**: 월드카페 템플릿, 학생 셀프 모둠 이동, 실제 Tier 결제 모델, CSV export

## 과제 게시판 (AB-1) — 2026-04-14
- **신규 엔티티**: `AssignmentSlot` (boardId, studentId, slotNumber, cardId, submissionStatus, gradingStatus, grade, viewedAt, returnedAt, returnReason). 1 classroom = ≤ 30 slots, `@@unique([boardId, studentId])` + `@@unique([boardId, slotNumber])`.
- `Board` 확장: `assignmentGuideText`, `assignmentAllowLate`, `assignmentDeadline`.
- `Submission.assignmentSlotId @unique` nullable FK — legacy event-signup submissions remain valid at NULL.
- **POST `/api/boards` assignment branch**: classroom 전원(N≤30) AssignmentSlot + 빈 Card 자동 생성 트랜잭션. 가드 — `classroom_required` / `not_classroom_teacher` / `empty_classroom` / `classroom_too_large` / `student_missing_number`.
- **GET `/api/boards/[id]/assignment-slots`** — viewer-scoped projection (teacher: all; student: own 1; parent: through existing scope).
- **PATCH `/api/assignment-slots/[id]`** — 교사 전이 (`open`/`return`/`review`/`grade`). State machine in `src/lib/assignment-state.ts`; 24 unit tests.
- **POST `/api/assignment-slots/[id]/submission`** — 학생 제출/재제출; `canStudentSubmit()` 가드 (deadline + allowLate + gradingStatus).
- **POST `/api/boards/[id]/reminder`** — 미제출 bulk 뱃지 (5-min per-board cooldown, no email).
- **POST `/api/boards/[id]/roster-sync`** — 수동 roster 추가 (slotNumber = max+1).
- **UI rewrite `src/components/AssignmentBoard.tsx`**: Submission+BoardMember 경로 폐기, AssignmentSlot 기반 재작성. 풀스크린 모달(prev/next + 키보드 `←/→` + inline 반려) + 학생 guide 상단 `.assign-return-banner` + 학생 submit card.
- **Identity-based 권한**: teacher/student/parent 3tier (`project_permission_model` 메모리 정합). `BoardMember.role=editor` 학생용 행 생성 금지.
- **Parent viewer `/parent/(app)/child/[studentId]/assignments`**: AssignmentSlot-backed rows 우선 — `returnReason` 배너 렌더, `submissionStatus` 라벨(assigned/submitted/viewed/returned/reviewed/orphaned).
- **Realtime**: `assignmentChannelKey(boardId)` helper + 3 event types. 공유 보드 학생 shell은 Supabase Realtime 구독으로 카드/섹션 변경 시 재조회한다.
- **2026-04-15 AB-1 후속 머지**:
  - AC-12 WebP 썸네일 파이프라인 완료 — `Card.thumbUrl` + `src/lib/blob.ts#resizeToWebPThumbUrl` + 학생 제출 시 자동 생성 + `slotRowToDTO` 가 thumbUrl 우선(없으면 imageUrl fallback).
  - AC-13 Matrix 뷰 server guard 완료 — `?view=matrix` 학생/학부모 `notFound()`, 모바일 UA redirect, 교사 데스크탑은 `.assign-board--matrix` 1열 placeholder.
  - AC-14 Galaxy Tab S6 Lite 실측은 하드웨어 제약으로 deferred.
- **2026-04-15 대시보드 생성 흐름 정비**:
  - `/api/boards` assignment branch 가 classroomId 없이 빈 보드 생성 가능 (board-first UX).
  - `/api/boards/[id]/roster-sync` 가 선택적 classroomId 수용 — 배당 + slot 일괄 생성 한 트랜잭션.
  - 교사 뷰 우하단 "학급 배당 / +N 동기화" FAB + `<AttachClassroomModal>`.

## 학부모 학급 초대 v2 (parent-class-invite-v2) — 2026-04-15
v1 per-student `ParentInviteCode` → v2 **학급 전체 8자리 ClassInviteCode + 이메일-우선 온보딩**.

- **스키마**: NEW `ClassInviteCode` (학급당 1 active, partial unique). ALTER `ParentChildLink` — `status` enum 4종 + 감사 10컬럼. enums `ParentLinkStatus/ParentRejectedReason/ParentRevokedReason`. 마이그레이션 `20260415_parent_class_invite_v2` 적용 — v1 active 행 `status='active'` 로, soft-delete 행 `status='revoked'` 로 백필.
- **API 신규**: `/api/class-invite-codes` (+ rotate, list), `/api/parent/signup`, `/api/parent/match/{code,request,retry}` + `GET /match/students`, `/api/parent/approvals/[linkId]/{approve,reject}` + `GET /api/parent/approvals`, `GET /api/cron/expire-pending-links`. v1 `redeem-code` + `parent-invites` 3라우트 → 410 Gone.
- **UI**: 교사 `/classroom/[id]/parent-access` Inbox-First 2-Column. 학부모 6단계 온보딩(`/parent/onboard/{signup,match/code,match/select,pending,rejected}`). 전역 `components/ui/{Toast,Stepper}.tsx`. 9종 React-email 템플릿.
- **권한 narrowing**: `src/lib/parent-scope.ts` 가 `status='active'` + `deletedAt:null` 2중 필터 — pending/rejected 유출 차단.
- **Rate limit**: `src/lib/rate-limit-parent.ts` 4축 (IP / code / classroom / rejection).
- **State machine**: `src/lib/parent-link-state.ts` + 10 unit tests (Vitest + @testing-library/react 신규 도입, 파일 패턴 `*.vitest.ts`).
- **Cron**: `0 17 * * *` KST 02:00 — D+3/D+6 리마인더 + D+7 자동 expire.
- **이메일 발송**: `PARENT_EMAIL_ENABLED=true` + `RESEND_API_KEY` + `PARENT_EMAIL_FROM` 세팅 시 실제 발송. 미설정 시 crash 없이 로그만.
- **Deferred**: Resend env 4개 + DNS 검증 / QR 서버 렌더 / Revoke API + ClassroomDeleteModal 배선 / `ParentInviteCode` Prisma 모델 cleanup(테이블은 drop, schema 잔존 의도적).

## 권한 모델 (role-model-cleanup) — 2026-04-15
3-tier `owner | editor | viewer` 단일 축 권한을 **identity × ownership 2축 primitive** 로 교체.

- **신규 `src/lib/card-permissions.ts`**: 4 순수 함수 `canViewCard / canEditCard / canDeleteCard / canAddCardToBoard`. `Identity` discriminated union (`teacher / student / parent / anon`). 17 vitest 매트릭스 커버.
- **신규 `src/lib/identity.ts`**: `resolveIdentity()` — per-request server-side 단일 resolver. NextAuth teacher → student_session → parent_session → anon 순 precedence.
- **카드 API 통합**: `PATCH / DELETE / move /api/cards/[id]*` 전부 primitive 경유. 학생이 자기 카드 **편집 가능** (신규), **이동 가능** (신규), **삭제 가능** (기존 유지). 교사 flow regression 0.
- **`src/lib/rbac.ts`**: `Role / Action / getBoardRole / requirePermission` 전부 `@deprecated` JSDoc. 교사 전용 라우트 17개는 여전히 호출하되 신규 callsite 금지.
- **Deferred (follow-up)**: POST /api/cards primitive 명시 호출, 4 카드 보드 UI 의 `isStudentViewer` prop → primitive 교체, CardDetailModal 학생 편집 UI 노출.

## 카드 다중 작성자 (card-author-multi) — 2026-04-15
Card 의 단일 `studentAuthorId` + 자유 `externalAuthorName` 구조를 **N:N CardAuthor join table** 로 정식 확장. 교사가 기존 카드의 작성자를 재지정하거나, 공동 발표·모둠 과제 카드에 여러 학생을 작성자로 배정할 수 있음.

- **스키마**: NEW `CardAuthor { cardId, studentId?, displayName, order, createdAt }` — @@unique([cardId, studentId]) + @@index([cardId, order]) + @@index([studentId]). `Card.studentAuthorId` + `Card.externalAuthorName` 은 primary (order=0) mirror 로 보존 → 기존 callsite 전수 호환.
- **마이그레이션**: `20260415_add_card_author` 비파괴 + 백필 (기존 student-authored 카드 전부 order=0 CardAuthor 1행 자동 생성).
- **API**: `PUT /api/cards/[id]/authors` (teacher-only replace-all), `GET /api/classroom/[id]/students` (roster), `POST /api/cards`·`/api/external/cards`·`/api/boards` (assignment 브랜치)·`roster-sync` 는 작성 시 CardAuthor 1행 자동 시드.
- **라이브러리**: `src/lib/card-author.ts#formatAuthorList` (0→fallback / 1→name / 2-3→comma / 4+→"name 외 N명"). `src/lib/card-authors-service.ts#setCardAuthors` (replace-all 트랜잭션 + validation + primary mirror).
- **UI**: ⋯ context menu 에 "작성자 지정" 항목(ColumnsBoard) / CardDetailModal 에 "👥 작성자 지정" 버튼 (4 board 공통). 모달: 학급 roster 체크박스 + 선택 순서 reorder + free-form row. 최대 10명.
- **권한**: canEditCard 는 primary 기준 유지 — 공동 작성자는 편집 불가 (scope OUT).
- **테스트**: Vitest 21 신규 (formatAuthorList 10 + setCardAuthors 11).
- **Deferred**: 공동 작성자 편집권 부여, AssignmentSlot 공동 작성자, /parent/child/[sid]/cards 피드 페이지.

## 학생 태블릿 반응형 (responsive-tablet) — 2026-04-15
**대상 기기**: Galaxy Tab S6 Lite 세로 1200×2000, Android Chrome. 이 기기 하나가 학생 실사용 기준이며 iPad/iOS 는 사용처 없음 (메모리 `project_perf_baseline_tab_s6_lite` 참조).

- **신규 토큰** `src/styles/tokens-responsive.css` — `--tap-min: 44px`, `--text-body: clamp(14px, 1.1vw, 16px)`, `--modal-max: min(92vw, 640px)`, `--fab-bottom-safe: calc(32px + env(safe-area-inset-bottom))` (env() 은 Android 에서 0 반환 — fallback 32px 유지).
- **⋯ 카드 컨텍스트 메뉴**: hover-only 제거. 기본 표시 + `@media (hover: hover)` 안에서만 opacity reveal. 터치 기기에서 상시 보임.
- **터치 타깃 44px 승격**: `.ctx-menu-trigger`, CardAuthorEditor row 이동/삭제 버튼이 `@media (pointer: coarse)` 에서 `--tap-min` 로 확장.
- **모달**: `.add-card-modal` 폭이 `--modal-max` 사용 — 뷰포트 92% 내 fit. `dvh` 높이로 주소창 변화 대응.
- **이미 충족 확인**: 학생 로그인 input 52px+, Drawing 툴바 48px, Quiz 답지 80px+ — 추가 수정 불필요.
- **Deferred**: 교사 대시보드 반응형 / 학부모 페이지 반응형 / 다크 모드.

## DJ Board (dj-queue) — 2026-04-18

Spotify 스타일 순차 YouTube 큐 + **classroom role system 신설**. DJ 역할 학생이 교사와 동등한 권한으로 큐를 운영.

### 데이터 모델
- `ClassroomRoleDef` — 역할 사전 (key/labelKo/emoji). seed: `dj`
- `BoardLayoutRoleGrant` — (classroom-role × board-layout → granted-role) 매핑. seed: `(dj, dj-queue) → owner`
- `ClassroomRoleAssignment` — (classroom, student, role) unique. teacher audit via `assignedById`
- `Card.queueStatus String?` — `"pending" | "approved" | "played" | "rejected"` (null = 비-큐 카드)

### 권한 resolver
- `src/lib/rbac.ts` → **`getEffectiveBoardRole(boardId, {userId?, studentId?})`** 신규
- precedence: teacher(BoardMember) → classroom-role grant → classroom viewer → null
- 기존 `getBoardRole` / `requirePermission` 경로 **불변** (17개 legacy 호출부)

### API
- `POST /api/boards/:id/queue` — 학생/교사 곡 제출. YouTube URL validation(host 화이트리스트) + oEmbed fetch(썸네일/제목/채널)
- `PATCH /api/boards/:id/queue/:cardId` — status 전이 (DJ/교사)
- `PATCH /api/boards/:id/queue/:cardId/move` — order 변경
- `DELETE /api/boards/:id/queue/:cardId` — DJ/교사 OR (pending+본인 학생)
- `GET /api/classrooms/:id/roles` — 역할 정의 + 현재 할당
- `POST /api/classrooms/:id/roles/assign` / `DELETE .../assign/:id` — 교사 전용
- `/api/boards/:id/stream` — 학생 세션 인증 허용 + CardWire에 `queueStatus` 포함

### UI
- `DJBoard` 셸 + `DJNowPlayingHeader` + `DJQueueList` + `DJQueueItem` + `DJSubmitForm` + `DJEmptyState`
- `ClassroomDJRolePanel` — `/classroom/:id` 하단 교사 전용 할당 패널

### Extensibility
사서·은행원 등 차후 역할 = **DB row 2개(ClassroomRoleDef + BoardLayoutRoleGrant) 추가만**. 코드·스키마 변경 없음.

### Out of scope (향후 task 후보)
- 실제 YouTube iframe 동기 재생 (WebRTC/WS 필요)
- 투표 기반 우선순위 (A2 jukebox 모델)
- 범용 classroom-role 관리 패널 (DJ 외 역할 추가 시 일반화)
- 키보드 드래그 접근성
- YouTube 부적절 콘텐츠 자동 탐지

## Classroom Bank (2026-04-19)

학급 화폐 + 체크카드 + 30일 만기 적금 + 매점 카드 결제 시뮬레이션. 교사/은행원/매점원 역할 분리.

### IA 재구조화
`/classroom/:id` → `/classroom/:id/students` 리다이렉트. 상단 탭 nav (`학생명부 · 학급보드 · 학급역할 · 은행 · 매점`) 공통 `ClassroomNav`.

### 데이터 모델 (7 신규)
`ClassroomCurrency`, `StudentAccount`, `StudentCard`, `FixedDeposit`, `StoreItem`, `Transaction` (balanceAfter 감사 체인), `ClassroomRolePermission`

### 권한 시스템
- `src/lib/bank-permissions.ts` PERMISSION_CATALOG 6키
- `hasPermission(classroomId, identity, permKey)`: teacher win → override → default catalog
- 1인 1역할 유지. `/classroom/:id/roles`에서 역할 카드 → 모달로 권한 체크박스 편집

### 학생용 `/my/wallet`
잔액 + 카드 QR (60초 로테이트) + 적금 진행 + 거래 최근 20건

### 매점 POS `/classroom/:id/pay`
상품 카트 + 카드 QR 토큰 입력 + 결제 확인 모달. 원자적 차감 (`db.$transaction` 내 잔액 재조회).

### Cron
`/api/cron/fd-maturity` 매일 00:05 KST — 만기 FD 자동 처리 (idempotent). `CRON_SECRET` bearer 인증.

### 향후 확장 후보
학생 간 이체 · 카메라 QR 스캐너 · Redis nonce · 자동 보상 훅 · 3분할 지갑 · Apple/Google Wallet Pass

## Vibe Coding Arcade (2026-04-20, Seed 13 v1) — 학급 Steam

학생이 Claude Sonnet과 바이브 코딩으로 제작한 HTML 아티팩트(게임·퀴즈·미니앱)를 반 친구들이 cross-origin 샌드박스에서 플레이·리뷰하는 보드 레이아웃. 교사 계정의 상시 잉여 Sonnet API 쿼터를 학생용 바이브 코딩 체험 예산으로 전환.

### 데이터 모델 (6 신규 + enum 확장)
- `VibeArcadeConfig` (`Board` 1:1) — moderationPolicy · perStudentDailyTokenCap · classroomDailyTokenPool · crossClassroomVisible · reviewAuthorDisplay · reviewRatingSystem · allowRemix · `enabled` gate
- `VibeProject` — htmlContent · thumbnailUrl · tags · moderationStatus · 집계 5필드(playCount/uniquePlayCount/reviewCount/ratingAvg/version)
- `VibeSession` — Sonnet 대화 `messages Json` · tokensIn/Out · status · refusalCount. `studentId` **nullable** (AC-G5 7일 미활성 익명화 cron이 SetNull)
- `VibeReview` — rating 1-5 + comment · `@@unique([projectId, reviewerStudentId])` (학생 1인 1리뷰) · flagCount 3 시 자동 hidden
- `VibePlaySession` — 플레이 원장 (postMessage 완료 신호 수신)
- `VibeQuotaLedger` — `(classroomId, studentId, date)` compound unique. `studentId` non-null + 센티넬 `"__CLASSROOM__"`로 학급 합계 행 구분 (Postgres NULL-distinct 회피)
- `Board.layout` enum에 `"vibe-arcade"` 추가

### API (신규 9 handler + 3 cron + 1 sandbox)
- `/api/vibe/config` GET · PATCH (교사 설정 · 404 on missing boardId)
- `/api/vibe/projects` GET (카탈로그, `tab=new|popular|to-review` · classroom scope 검증) · POST (제출 · moderation-filter HTML 스캔)
- `/api/vibe/sessions` POST (SSE Sonnet 스트림 · req.signal abort)
- `/api/vibe/reviews` POST + `/reviews/:id/flag` POST (self-review 차단 · 3건 자동 숨김)
- `/api/vibe/play-sessions` POST (playToken JWT 1h) + `/:id` PATCH (postMessage 완료 · 집계 증분)
- `/api/vibe/moderation/:projectId` POST (owner/editor 승인·반려 + note 필수)
- `/api/vibe/quota` GET (교사 대시보드)
- `/sandbox/vibe/:projectId` GET — cross-origin `sandbox.aura-board.app` 서빙 · CSP sandbox + frame-src none + CDN 화이트리스트(jsdelivr/cdnjs/unpkg)
- Cron 3종: `vibe-arcade-{quota-rollup,anonymize,hard-delete}` (Vercel Cron + `x-vercel-cron` / `CRON_SECRET`)

### 보안
- 4중 샌드박스: cross-origin 서브도메인 + `<iframe sandbox="allow-scripts">`(allow-same-origin 금지) + CSP `sandbox` 헤더 + postMessage origin 화이트리스트
- HMAC playToken(timing-safe verify, 1h TTL)
- `moderation-filter.scanHtml`: 금지 태그(`<iframe>·<object>·<embed>`) + 스킴(`javascript:`·`data:text/html`) + 외부 URL 화이트리스트
- `scanText`: 욕설 + 개인정보(전화·주민·이메일) regex
- 쿼터 3단: 교사 월 → 학급 일일 풀 150만 → 학생 45K (소진 시 "내일 다시" — Haiku 다운그레이드 금지)

### UI (현재 스코프 = 뼈대)
- `src/components/VibeArcadeBoard.tsx` — layout root, 5 상태(gate-off/loading/ready/empty/error)
- `src/components/vibe-arcade/StarRating.tsx` — 별점 표시·입력(sm/md/lg, aria radiogroup)
- `src/styles/vibe-arcade.css` — v2 Notion Soft(카탈로그 grid + 탭 + FAB + skeleton shimmer + 반응형 4 브레이크)
- **미구현 (phase7 후속)**: VibeCodingStudio · PlayModal · ReviewPanel · TeacherModerationDashboard · QuotaGauge · TokenCountPill · ModerationStatusBadge · SandboxIframe · StreamingChatBubble · TagChip · ApprovalQueueCard · EmergencyStopButton

### 런칭 게이팅
- `VibeArcadeConfig.enabled` 기본 false (FeatureFlag 테이블 미신설, Config에 흡수)
- Pro tier 전용 (학교 플랜 v2+)
- `crossClassroomVisible=false` 기본 (반 내부만)

### 프로덕션 진입 전 차단 (SEC-1~6)
1. 교사 `SONNET_API_KEY` DB 암호화(CanvaConnectAccount 스타일)
2. 학생별 rate limit (`@upstash/ratelimit`)
3. 일일 비정상 소비 Slack 경보
4. iframe postMessage origin 검증(PlayModal 클라)
5. `sandbox.aura-board.app` DNS + Vercel 도메인
6. `SONNET_API_KEY` · `PLAYTOKEN_JWT_SECRET`(32+) · `NEXT_PUBLIC_APP_ORIGIN` · `CRON_SECRET` Vercel env

## 학생 포트폴리오 + 자랑해요 (student-portfolio) — 2026-04-26

학생들이 학급 친구 결과물을 모아 보고, 자기 카드 중 잘된 것을 학급 메인
화면에 옵트인으로 띄우는 채널. 부수적으로 학부모 뷰가 자녀 카드 + 자랑
해요로 자연스럽게 정의됨.

### 진입점
- `/student/portfolio` — 좌측 학급 학생 리스트 + 우측 선택된 학생 카드 그리드
- `/student` (메인) 상단 가로 carousel — 학급 자랑해요 highlight strip + 포트폴리오 CTA
- `/parent/(app)/child/[studentId]/portfolio` — 자녀 카드 + 학급 자랑해요 통합 (ChildTabs "포트폴리오" 탭)

### 주요 동작
- 좌측 학생 이름 클릭 → 우측 그리드 갱신 (SPA-like, 페이지 이동 X)
- 카드별 출처 라벨: 주제별 보드(layout=columns)면 `{보드 제목} · {칼럼 제목}`, 그 외 `{보드 제목}`
- 본인 작성/공동작성 카드 우클릭 → "🌟 자랑해요에 올리기" 토글
- 자랑해요 등록 카드는 양쪽(포트폴리오 페이지 + 학급 dashboard)에 🌟 코너 배지로 노출
- 학생당 자랑해요 **최대 3개** — 4번째 시도 시 모달로 기존 1개 선택해 내림

### 권한
- 학생 ↔ 학생: 학급 내 모두 가시 (보드 가시성과 일관)
- 학부모 → 자녀: 자녀 본인 카드 + 학급 자랑해요만. 자녀 외 비-자랑해요 카드 0건 누출 (E2E 권한 가드)
- 교사: 자기 학급 모두. 자랑해요 토글 권한 X (학생 자율 정책)

### 데이터 모델
- `ShowcaseEntry` 신규 — `(cardId, studentId)` unique. classroomId denorm. 한 학생 한 카드 1슬롯.
- `Card`/`Student` 컬럼 무변경. 카드 삭제 → ShowcaseEntry 자동 cascade

### 디자인 토큰
- `--color-showcase` (alias of `--color-vibe-rating`, amber #f5a623) — 🌟 배지·strip 헤더

### 비포함 (v2)
- 검색·필터, 좋아요·댓글, 교사 모더레이션, 부적절 신고, 학교 전체 자랑해요, 학급 자랑해요 한도 customization

### 회귀 테스트
- `portfolio-acl.vitest.ts` 12건 (권한 매트릭스)
- `source-label.vitest.ts` 4건 (출처 라벨 분기)

## 학부모 OAuth + 통합 대시보드 (parent-redesign) — 2026-04-26

학부모 매직링크 인증 + 자녀 페이지 6탭 → OAuth(Google+Kakao) 추가 +
대시보드 = portfolio 1개로 통합. 학급 자랑해요 별도 진입점.

### 진입점
- `/parent/onboard/signup` — Google/Kakao OAuth 버튼 우선 + 매직링크 토글 fallback
- `/api/parent/auth/{google,kakao}` — OAuth 시작
- `/api/parent/auth/callback/{provider}` — code 교환 + Parent upsert + 세션 발급
- `/parent/(app)/home` — 대시보드 (자녀 chip 셀렉터 + portfolio 본문 + 자랑해요/자녀추가 액션)
- `/parent/(app)/showcase` — 학급 자랑해요 그리드

### 주요 동작
- OAuth 첫 로그인: provider 인증 → 신규 Parent + ParentOAuthAccount → onboard/match/code 진입
- OAuth 재로그인: provider 인증 → 기존 Parent 즉시 사용 → 대시보드
- email 매칭으로 기존 매직링크 학부모 자동 link (verified email 만)
- 다자녀: 헤더 chip 클릭 → dropdown 으로 자녀 전환 (URL ?child=ID)
- 자녀 추가: 헤더 [+ 자녀 추가] 또는 dropdown 마지막 항목 → /parent/onboard/match/code

### 권한
- ParentOAuthAccount: (provider, providerAccountId) unique 로 OAuth 계정 = Parent 1:1
- 자녀 외 학생 카드: 0건 누출 (ParentPortfolioView API 가드)
- 학급 자랑해요: 자녀 학급의 자랑해요만

### 데이터 모델
- `ParentOAuthAccount` 신규 (parentId+provider+providerAccountId)
- 기존 Parent / ParentSession / ParentChildLink 무변경

### 디자인 토큰
- `--color-oauth-google` `#4285F4`
- `--color-oauth-kakao` `#FEE500`

### 환경변수 추가 (사용자 작업)
```
GOOGLE_PARENT_CLIENT_ID
GOOGLE_PARENT_CLIENT_SECRET
KAKAO_PARENT_CLIENT_ID
KAKAO_PARENT_CLIENT_SECRET
PARENT_OAUTH_REDIRECT_BASE_URL
```

### 비포함 (v2)
- Apple / Naver OAuth
- 매직링크 deprecate (현재 fallback 으로 보존)
- plant 진행도 그래프 등 5탭 sub-feature 별도 시각화 (portfolio 카드 단위로 통합)
- placeholder email 발송 path skip 자동화
