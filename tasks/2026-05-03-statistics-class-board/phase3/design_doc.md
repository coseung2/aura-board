# Design Doc — statistics-class-board

## 1. 데이터 모델 변경

### 1-1. Prisma schema 추가

```prisma
// Board.layout enum 확장 (앱 레벨 Zod + UI 상수 동기화 필요)
// 기존: "freeform" | "grid" | "stream" | "columns" | "assignment" | "quiz" | "plant-roadmap" | "event-signup" | "drawing" | "breakout" | "vibe-arcade" | "vibe-gallery"
// 추가: "statistics"

enum MissionStatus {
  not_started
  in_progress
  pending_approval
  approved
  teacher_working
  completed
}

model Mission {
  id              String        @id @default(cuid())
  sectionId       String
  stepNumber      Int           // 1 ~ 11
  status          MissionStatus @default(not_started)
  content         Json          @default("{}") // 미션별 산출물 (아래 스키마 참고)
  submittedAt     DateTime?
  approvedAt      DateTime?
  approvedBy      String?       // User.id (교사)
  teacherFeedback String?
  version         Int           @default(0) // 낙관적 잠금
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  section Section @relation(fields: [sectionId], references: [id], onDelete: Cascade)

  @@unique([sectionId, stepNumber])
  @@index([sectionId, status])
  @@index([sectionId, stepNumber])
}
```

### 1-2. Mission.content JSON 스키마 (TypeScript)

```typescript
type MissionContent = {
  // 미션 1: 주제 카드
  topic?: {
    subject: string;
    curiosity: string;
    stakeholders: string;
    relevance: string;
  };

  // 미션 2: 질문 사다리
  questionLadder?: {
    originalQuestion: string;
    weakness: string;
    experience: string;
    currentStatus: string;
    reason: string;
    condition: string;
    alternative: string;
    position: string;
    llmFeedback?: string; // LLM 피드백 캐시
  };

  // 미션 3: 설문 문항
  survey?: {
    items: Array<{
      question: string;
      options: string[];
      isKeyItem: boolean;
    }>;
  };

  // 미션 4: 조사 계획
  investigationPlan?: {
    target: string;
    goalCount: number;
    method: string;
    period: string;
    linkOrMethod: string;
    additional: string[];
  };

  // 미션 5: 자료 수집
  dataCollection?: {
    respondentCount: number;
    period: string;
    notes: string;
  };

  // 미션 6: 표와 그래프 계획
  graphPlans?: Array<{
    content: string;
    type: string; // "bar" | "pie" | "line" | "grouped-bar" | "map"
    insight: string;
  }>;

  // 미션 7: 결과 해석
  interpretation?: {
    fact: string;
    highest: string;
    lowest: string;
    expected: string;
    unexpected: string;
    meaning: string;
  };

  // 미션 8: 결론·제안·한계점
  conclusion?: {
    findings: string[]; // 3가지
    conclusion: string;
    proposal: string;
    schoolAction: string;
    homeAction: string;
    friendAction: string;
    limitations: string;
  };

  // 미션 9: 포스터 제작 의뢰서
  posterRequest?: {
    teamName: string;
    topic: string;
    posterTitle: string;
    motivation: string;
    questions: string;
    subjects: string;
    methods: string;
    keyData: string;
    graphs: string;
    discoveries: string[];
    conclusion: string;
    proposal: string;
    limitations: string;
    mood: string;
  };

  // 미션 10: 포스터 검토
  posterReview?: {
    isAccurate: boolean;
    titleCorrect: boolean;
    conclusionVisible: boolean;
    noFabrication: boolean;
    limitationIncluded: boolean;
    revisionRequests: string;
  };

  // 미션 11: 발표 준비
  presentation?: {
    structure: string[];
    ready: boolean;
  };
};
```

### 1-3. 마이그레이션 전략

- **신규 마이그레이션**: `prisma/migrations/20260503_add_mission_table/migration.sql`
- **데이터 시딩**: Board.layout="statistics" 생성 시 `db.$transaction`으로 11개 Mission row 자동 생성 (기존 breakout 보드 생성 패턴과 동일)
- **롤백**: `DROP TABLE "Mission" CASCADE;` — Section에만 의존하므로 다른 테이블 영향 없음

---

## 2. API 변경

### 2-1. 신규 엔드포인트

| Method | Path | Auth | 설명 |
|---|---|---|---|
| GET | `/api/sections/[sectionId]/missions` | Student/Teacher | 팀별 11개 미션 목록. 학생은 소속 팀만, 교사는 전체 |
| GET | `/api/sections/[sectionId]/missions/[step]` | Student/Teacher | 특정 미션 상세 + content |
| PATCH | `/api/sections/[sectionId]/missions/[step]` | Student/Teacher | content 수정. 낙관적 잠금(version) 필수 |
| POST | `/api/sections/[sectionId]/missions/[step]/submit` | Student | 승인 요청. status → pending_approval |
| POST | `/api/sections/[sectionId]/missions/[step]/approve` | Teacher | 승인. status → approved. 다음 미션 잠금 해제 |
| POST | `/api/sections/[sectionId]/missions/[step]/reject` | Teacher | 반려. status → in_progress + feedback |
| POST | `/api/sections/[sectionId]/missions/[step]/llm-feedback` | Student | LLM 피드백 요청. 응답을 content.questionLadder.llmFeedback에 저장 |
| GET | `/api/boards/[boardId]/missions/dashboard` | Teacher | 교사용 대시보드. 모든 팀(section)의 미션 상태 요약 |

### 2-2. 요청/응답 예시

**PATCH /api/sections/[sectionId]/missions/[step]**
```json
// Request
{
  "content": {
    "questionLadder": {
      "experience": "노키즈존이라는 말을 들어본 적이 있습니다.",
      "currentStatus": "학교 주변 카페 20곳 중 5곳이 노키즈존입니다."
    }
  },
  "expectedVersion": 3
}

// Response (200)
{
  "id": "...",
  "sectionId": "...",
  "stepNumber": 2,
  "status": "in_progress",
  "content": { ... },
  "version": 4,
  "updatedAt": "2026-05-03T10:00:00Z"
}

// Conflict (409)
{
  "error": "VERSION_CONFLICT",
  "message": "다른 사용자가 먼저 수정했습니다. 새로고침 후 다시 시도해 주세요.",
  "currentVersion": 5
}
```

**POST /api/sections/[sectionId]/missions/[step]/llm-feedback**
```json
// Request
{
  "ladderStep": "experience", // "experience" | "currentStatus" | "reason" | "condition" | "alternative" | "position"
  "text": "노키즈존이라는 말을 들어본 적이 있나요?"
}

// Response (200)
{
  "feedback": "좋은 경험 질문입니다! '들어본 적'보다 '직접 겪은 경험'을 묻는 것이 더 구체적인 데이터를 수집할 수 있습니다. 예: '가족과 함께 가려던 곳이 노키즈존이라 들어가지 못한 경험이 있나요?'"
}
```

### 2-3. 실시간 이벤트

기존 SSE 폴링(`/api/boards/[id]/stream`)을 확장:
- `event: mission_updated` — 미션 상태/내용 변경 시 payload: `{ sectionId, stepNumber, status, version }`
- `event: approval_requested` — 학생이 승인 요청 시 payload: `{ sectionId, stepNumber, teamName }`
- 교사 대시보드는 3초 폴링 또는 SSE 구독으로 업데이트

---

## 3. 컴포넌트 변경

### 3-1. 신규 컴포넌트 트리

```
StatisticsBoard (page: /board/[id] layout="statistics")
├── BoardHeader (기존 재사용)
│   └── BoardSettingsLauncher (⚙ → 승인 게이트 설정)
├── StatisticsBoardClient
│   ├── MissionStepper (수직 스텝퍼, 11단계)
│   │   └── MissionStepItem
│   │       ├── StatusBadge (⬜🟡🟢🔵✅)
│   │       └── StepTitle
│   ├── MissionPanel (현재 선택된 미션 확장 영역)
│   │   ├── Mission1TopicCard (주제 카드)
│   │   ├── Mission2QuestionLadder ← 핵심
│   │   │   ├── QuestionLadderAccordion (6단계)
│   │   │   │   ├── LadderStepInput (textarea + 예시 풍선)
│   │   │   │   └── LlmFeedbackBubble (LLM 피드백 표시)
│   │   │   └── LlmFeedbackButton
│   │   ├── Mission3SurveyBuilder (설문 문항)
│   │   ├── Mission4InvestigationPlan (조사 계획)
│   │   ├── Mission5DataCollection (자료 수집)
│   │   ├── Mission6GraphPlanner (그래프 계획)
│   │   ├── Mission7ResultInterpreter (해석)
│   │   ├── Mission8ConclusionWriter (결론)
│   │   ├── Mission9PosterRequest (의뢰서)
│   │   ├── Mission10PosterReview (검토)
│   │   ├── Mission11PresentationPrep (발표)
│   │   └── MissionActionBar
│   │       ├── SaveDraftButton
│   │       ├── SubmitForApprovalButton (잠긴 미션 → disabled)
│   │       └── ApprovalStatusBanner (승인 대기 중 / 반려 사유)
│   └── TeamStatusBar ("지금 우리 팀은 미션 N 진행 중")
└── TeacherDashboard (교사만, 별도 탭 또는 사이드 패널)
    ├── TeamProgressTable (팀명 | 주제 | 현재미션 | 상태)
    ├── ApprovalQueuePanel (승인 대기 목록)
    └── BulkActionToolbar
```

### 3-2. 수정 컴포넌트

| 컴포넌트 | 수정 내용 |
|---|---|
| `BoardCanvas` 또는 `board/[id]/page.tsx` | `layout === "statistics"` 분기 추가 → `<StatisticsBoardClient />` 렌더링 |
| `CreateBoardModal` | Layout 선택에 "통계활용대회 학급보드" 옵션 추가 |
| `LAYOUT_LABEL` 상수 | `"statistics": "통계활용대회 학급보드"` 추가 |

### 3-3. 상태 위치

| 상태 | 위치 | 이유 |
|---|---|---|
| 11개 Mission row | Server (DB) | 팀별 영구 데이터, 낙관적 잠금 |
| 현재 선택된 step | Client (React State) | URL query param (`?step=2`)로 복원 가능 |
| 폼 draft | Client (React State) | 자동 저장 없이 사용자가 명시적으로 저장/제출 |
| LLM 피드백 응답 | Client (React State) + Server cache | content.questionLadder.llmFeedback에 저장, 재조회 시 캐시 활용 |
| 교사 대시보드 데이터 | Client (React Query / SWR) | 3초 폴링 또는 SSE |

---

## 4. 데이터 흐름 다이어그램

### 4-1. 학생 미션 수행 플로우

```
[학생 브라우저]
    │
    ▼
[MissionStepper] — 클릭 —► [MissionPanel 로드]
    │                              │
    │                              ▼
    │                    [GET /api/sections/:sid/missions/:step]
    │                              │
    │                              ▼
    │                         [Prisma: Mission.findUnique]
    │                              │
    │                              ▼
    │                    [폼 렌더링 — 아코디언/텍스트area]
    │                              │
    │                    [입력 중...] —► [자동 저장 X]
    │                              │
    │                    [저장 버튼 클릭]
    │                              │
    │                              ▼
    │                    [PATCH /api/sections/:sid/missions/:step]
    │                         Body: { content, expectedVersion }
    │                              │
    │                              ▼
    │                         [Prisma: update where version=expectedVersion]
    │                              │
    │                    ┌─────────┴─────────┐
    │              [성공]                   [충돌 409]
    │                    │                        │
    │                    ▼                        ▼
    │         [낙관적 UI 업데이트]      ["다른 팀원이 수정 중" 알림]
    │                    │
    │                    ▼
    │         [완료 버튼 클릭]
    │                    │
    │                    ▼
    │         [POST .../submit]
    │                    │
    │                    ▼
    │         [status → pending_approval]
    │                    │
    │                    ▼
    │         [SSE emit: approval_requested]
    │                    │
    ▼────────────────────┘
[교사 대시보드] — 알림 배지 표시
```

### 4-2. 교사 승인 플로우

```
[교사 브라우저]
    │
    ▼
[TeacherDashboard] — 폴링 3초
    │
    ▼
[GET /api/boards/:bid/missions/dashboard]
    │
    ▼
[Prisma: Mission.findMany where section.boardId = bid]
    │
    ▼
[TeamProgressTable 렌더링]
    │
    ▼
[승인 요청 클릭]
    │
    ▼
[POST /api/sections/:sid/missions/:step/approve]
    │
    ▼
[Prisma: $transaction]
  1. UPDATE Mission SET status="approved", approvedAt=now(), approvedBy=teacherId
  2. (if step in [2,3,6,8]) UPDATE Mission SET status="not_started" WHERE stepNumber=nextStep
    │
    ▼
[SSE emit: mission_updated]
    │
    ▼
[학생 브라우저] — 다음 미션 잠금 해제
```

### 4-3. LLM 피드백 플로우

```
[학생 브라우저]
    │
    ▼
[질문 사다리 입력 중]
    │
    ▼
[AI 조언 받기 버튼 클릭]
    │
    ▼
[POST /api/sections/:sid/missions/:step/llm-feedback]
    │
    ▼
[서버: validate student membership]
    │
    ▼
[서버: check quota (optional)]
    │
    ▼
[서버: TeacherLlmKey 조회 → 복호화]
    │
    ▼
[서버: streamSonnet() 호출]
    │  systemPrompt: "당신은 통계 탐구 보조교사입니다..."
    │  messages: [{role:"user", content: "학생이 쓴 질문: ..."}]
    │
    ▼
[Anthropic API]
    │
    ▼
[스트리밍 응답 → 서버 누적 → 최종 JSON 반환]
    │
    ▼
[서버: Mission.update { content: { questionLadder: { llmFeedback: "..." } } }]
    │
    ▼
[학생 브라우저: LlmFeedbackBubble에 표시]
```

---

## 5. 엣지케이스

| # | 시나리오 | 영향 | 처리 방식 |
|---|---|---|---|
| 1 | **네트워크 단절 중 폼 입력** | 데이터 유실 | 낙관적 업데이트 실패 시 UI 롤백 + "저장에 실패했습니다. 네트워크를 확인해 주세요." 토스트. 자동 저장(draft)은 MVP에서 제외. |
| 2 | **동시 편집 충돌** | 데이터 덮어쓰기 | `version` 필드 낙관적 잠금. `UPDATE ... WHERE version = expectedVersion` 실패 시 409 Conflict 반환. 클라이언트는 "다른 팀원이 수정 중입니다. 새로고침 후 다시 시도해 주세요." 메시지 표시. |
| 3 | **교사 승인 전 다음 미션 API 직접 호출** | 보안 우회 | API 레벨에서 `currentMission.status !== "approved"` 검증. 조건 미충족 시 `ForbiddenError("이전 미션이 승인되지 않았습니다.")`. UI에서도 버튼 비활성화로 이중 방어. |
| 4 | **LLM API 타임아웃/실패** | UX 지연 | `Promise.race([streamSonnet(), sleep(5000)])`로 5초 타임아웃. 실패 시 `{ feedback: "AI 조언을 불러올 수 없습니다. 잠시 후 다시 시도해 주세요." }` 반환. 입력 필드는 차단하지 않음. |
| 5 | **팀에 학생 0명** | 진행 불가 | 보드 접근 시 "아직 팀원이 없습니다. 교사에게 팀 배정을 요청하세요." 배너 표시. MissionStepper는 렌더링되지만 모든 폼은 read-only. |
| 6 | **브라우저 새로고침 중 상태 불일치** | 데이터 싱크 | SSE 폴링(3초) 또는 수동 새로고침. 현재 realtime placeholder이므로 수동 새로고침 버튼을 MissionStepper 상단에 배치. |
| 7 | **교사 반려 후 학생이 재제출하지 않음** | 진행 정체 | 대시보드에 "수정 중(반려)" 상태를 🟡와 별도 아이콘으로 표시. 24시간 이상 미제출 시 교사가 직접 독려 가능. |
| 8 | **Mission row 누락 (보드 생성 실패)** | 404 | `GET /api/sections/:sid/missions`에서 row 없으면 `db.mission.createMany()`로 자동 시딩(idempotent). |

---

## 6. DX 영향

### 6-1. 타입/린트/테스트

- **신규 타입 파일**: `src/lib/statistics/types.ts` — `Mission`, `MissionStatus`, `MissionContent`, `QuestionLadder`, `PosterRequest` 등
- **Zod 스키마**: `src/lib/statistics/schemas.ts` — API 요청/응답 검증용 (기존 API 패턴과 동일)
- **Prisma Client 타입**: `npx prisma generate` 실행 필수
- **테스트**: `src/lib/statistics/statistics.vitest.ts` — Mission content JSON 검증, 낙관적 잠금 로직 단위 테스트

### 6-2. 빌드/배포

- **마이그레이션**: `prisma migrate dev` → staging/production에 `prisma migrate deploy`
- **새 CSS 파일**: `src/styles/statistics.css` — `globals.css`에 `@import` 추가
- **번들 크기**: LLM 관련 컴포넌트(LlmFeedbackBubble)는 dynamic import로 코드 분할
- **환경 변수**: 기존 `SONNET_API_KEY_ENC_KEY`, `SONNET_MODEL_ID` 재활용. 추가 변수 없음.

### 6-3. 기존 코드 영향

| 파일 | 영향 |
|---|---|
| `src/app/api/boards/route.ts` | layout Zod enum에 `"statistics"` 추가 |
| `src/app/board/[id]/page.tsx` | `case "statistics"` 분기 추가 |
| `src/components/CreateBoardModal.tsx` | LAYOUTS 배열에 statistics 옵션 추가 |
| `src/lib/layouts.ts` (또는 유사) | `LAYOUT_LABEL["statistics"]` 추가 |
| `src/styles/globals.css` | `@import "statistics.css"` 추가 |

---

## 7. 롤백 계획

### 7-1. DB 롤백

```bash
# 1. 마이그레이션 되돌리기
npx prisma migrate rollback

# 2. 또는 수동 DROP (production emergency)
psql $DATABASE_URL -c 'DROP TABLE "Mission" CASCADE;'
```

### 7-2. 애플리케이션 롤백

| 순서 | 대상 | 작업 |
|---|---|---|
| 1 | API 라우트 | `src/app/api/sections/[sectionId]/missions/` 디렉토리 삭제 → 404 |
| 2 | 페이지 컴포넌트 | `src/app/board/[id]/page.tsx`에서 `case "statistics"` 제거 → 기존 보드로 폴백 |
| 3 | layout enum | Zod 스키마와 `LAYOUT_LABEL`에서 `"statistics"` 제거. 이미 생성된 보드는 DB에서 `layout="breakout"`으로 마이그레이션 후 제거 |
| 4 | CSS | `src/styles/statistics.css` 삭제, `globals.css` import 제거 |
| 5 | 타입/라이브러리 | `src/lib/statistics/` 디렉토리 삭제 (사용처가 사라지므로 빌드 에러 없음) |

### 7-3. 데이터 보존

- 롤백 전 `Mission` 테이블을 `Mission_backup_20260503`으로 `CREATE TABLE ... AS SELECT * FROM "Mission"` 백업
- 백업 데이터는 CSV/JSON으로 export하여 교사에게 제공 가능

### 7-4. 롤백 트리거 조건

- `npm run build` 실패 또는 `npm run typecheck` 실패
- staging 테스트 중 11개 미션 중 3개 이상의 승인 게이트 오작동
- LLM API 연동으로 인한 500 에러율 > 10%
- 팀별 데이터 격리 누수 (학생 A가 팀 B의 미션 조회 가능)
