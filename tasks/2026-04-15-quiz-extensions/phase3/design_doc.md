# Design Doc — quiz-extensions

task_id: 2026-04-15-quiz-extensions
upstream: phase2/scope_decision.md

## 0. 기존 아키텍처 재확인 (phase2 에 반영 안 된 사실)

코드 감사 결과:

1. **Quiz 는 live-session 모델** — `roomCode` (6자리) + `currentQ` + `status: waiting|active|finished`. Kahoot 스타일. 학생은 `QuizPlayer` row 로 join.
2. **답안 연결**: `QuizAnswer.playerId` → `QuizPlayer.studentId?` → `Student`. 익명 플레이어(studentId null)는 `QuizPlayer.nickname` 으로만 식별.
3. **PATCH `/api/quiz/[id]` 이미 사용 중** — `action: "start"|"next"|"finish"` 세션 제어용. **B3 의 "questions 교체" PATCH 는 별도 엔드포인트로 분리 필요.** → `PUT /api/quiz/[id]/questions` 로 결정.
4. **권한 소스**: `Identities.teacher.ownsBoardIds` (src/lib/card-permissions.ts). 퀴즈의 board 가 ownsBoardIds 에 포함되면 해당 교사가 관리 가능. 별도 `Quiz.createdById` 컬럼 **불필요**.
5. **기존 `numQuestions`**: `/api/quiz/create` 가 이미 formData 로 수신 중 (기본 5). B2 는 `difficulty` 추가 + UI 노출이 주 작업.

## 1. 데이터 모델 변경

### prisma/schema.prisma
```diff
 model Quiz {
   id         String   @id @default(cuid())
   boardId    String
   title      String   @default("")
   ...
+  difficulty    String? // "easy" | "medium" | "hard"
+  parentQuizId  String? // clone 시 원본 Quiz.id (self-ref, no FK — 원본 삭제 허용)
   createdAt  DateTime @default(now())
   board      Board          @relation(fields: [boardId], references: [id], onDelete: Cascade)
   questions  QuizQuestion[]
   players    QuizPlayer[]
   @@index([boardId])
   @@index([roomCode])
+  @@index([parentQuizId])
 }
```

- `Quiz.status` 'draft' 값 추가는 **SKIP** — draft 는 DB 미저장 설계.
- `QuizAnswer.@@index([quizId, userId])` 추가는 **검토 후 SKIP** — 실제 스키마는 `QuizAnswer.questionId` + `playerId` 기반. 리포트 쿼리는 `QuizQuestion.quizId` → questions[].answers 의 include 로 수행. 기존 `@@index([questionId])` + `@@unique([questionId, playerId])` 로 충분.

### 마이그레이션 전략
- `prisma migrate dev --name quiz_extensions_difficulty_parent` 로 migration SQL 생성.
- 두 컬럼 모두 nullable — 기존 row 무영향. `parentQuizId` 는 FK 제약 없음 (원본 삭제 허용).
- 배포 전 `prisma migrate status` 로 pending migration 확인 (memory feedback_migration_pending_canva.md 준수).

## 2. API 변경

### 신규
| Method | Path | 용도 | Auth |
|---|---|---|---|
| POST | `/api/quiz/draft` | LLM 생성만 (DB 미저장), `{questions}` JSON 반환 | 교사 owner |
| PUT | `/api/quiz/[id]/questions` | questions 전체 교체 (트랜잭션으로 기존 delete + 재생성) | 교사 owner |
| GET | `/api/quiz/[id]/report` | 리포트 JSON (summary + matrix) | 교사 owner |
| GET | `/api/quiz/[id]/report.csv` | CSV 다운로드 (UTF-8 BOM) | 교사 owner |
| POST | `/api/quiz/[id]/clone` | 새 Quiz+questions 복사, parentQuizId 기록 | 교사 owner |
| GET | `/api/quiz/library` | 교사 본인 ownsBoardIds 범위 퀴즈 리스트 (최신순, 페이지네이션) | 교사 |

### 수정
| Method | Path | 변경 |
|---|---|---|
| POST | `/api/quiz/create` | `difficulty`, `countMode`, `questionCount?` 수신 → `generateQuizFromText()` 에 전달. `auto` 모드: LLM 결과 그대로 수용, 20 cap 만. `fixed` 모드: `Math.min(20, Math.max(1, questionCount))` 클램프 후 LLM 에 정확히 N개 지시, `slice(0, N)`. `Quiz.difficulty` 저장. draft 로부터 승격 경로도 지원 (`draftQuestions` JSON 옵션 필드 — 있으면 LLM 건너뛰고 그대로 저장). |
| PATCH | `/api/quiz/[id]` | 변경 없음 (action=start/next/finish 유지). |

### 요청/응답 스키마

```ts
// POST /api/quiz/draft
Req:  FormData {
  boardId, text?, file?,
  difficulty: "easy"|"medium"|"hard",
  countMode: "auto" | "fixed",
  questionCount?: number   // fixed 모드에서만 (1~20, 서버 클램프)
}
Res:  { questions: Array<{ question, optionA, optionB, optionC, optionD, answer }> }

// POST /api/quiz/create  (draft 승격 경로)
Req:  FormData { boardId, title?, difficulty, questionCount, draftQuestions: JSON.stringify([...]) }
Res:  { quiz: Quiz & { questions: QuizQuestion[] } }

// PUT /api/quiz/[id]/questions
Req:  { questions: Array<{ question, optionA, optionB, optionC, optionD, answer }> }
Res:  { quiz: Quiz & { questions: QuizQuestion[] } }

// GET /api/quiz/[id]/report
Res:  {
  summary: { submittedCount, avgCorrectRate, avgTimeMs },
  questions: Array<{ id, order, question, answer }>,
  players: Array<{
    playerId, studentId: string|null, name: string,
    answers: Array<{ questionId, selected: string|null, correct: boolean|null, timeMs: number|null }>,
    score: number, totalCorrect: number
  }>
}

// POST /api/quiz/[id]/clone
Req:  { boardId?: string, sectionId?: string } // 미전달 시 원본과 같은 board
Res:  { quiz: Quiz }

// GET /api/quiz/library?cursor=...&limit=20
Res:  { items: Array<{ id, title, createdAt, difficulty, boardId, questionCount }>, nextCursor: string|null }
```

### 실시간 이벤트
- 신규 이벤트 없음. 기존 `/api/quiz/[id]/stream` SSE 는 PATCH action 기반이므로 영향 없음.
- B3 저장 완료 후 해당 board 의 섹션 목록 refetch 는 클라이언트 책임 (기존 `mutate` 사용).

### LLM 프롬프트 분기 (`lib/quiz-llm.ts` 수정)
```
generateQuizFromText(text, apiKey, countSpec, provider, difficulty)
  where countSpec = { mode: "auto" } | { mode: "fixed", n: number }

auto    → prompt: "본문 길이와 내용에 맞는 적절한 수의 4지선다 문항을 생성하세요. 최대 20개를 넘지 않도록. 너무 짧으면 3~5개도 허용."
fixed   → prompt: "정확히 {n}개의 4지선다 문항을 생성하세요."
difficulty → 각 모드 공통으로 프롬프트 prefix 에 "난이도: {difficulty}" 주입.
```

### 권한 체크 (공통)
새 헬퍼 `src/lib/quiz-permissions.ts`:
```ts
export async function canManageQuiz(quizId: string, ids: Identities): Promise<boolean> {
  if (!ids.teacher) return false;
  const quiz = await db.quiz.findUnique({ where: { id: quizId }, select: { boardId: true } });
  if (!quiz) return false;
  return ids.teacher.ownsBoardIds.has(quiz.boardId);
}
```
- draft/create 는 `canAddCardToBoard(ids, board)` 재사용 (board 기반).
- 학생/학부모는 이 엔드포인트 전부 403 (리포트 포함).

## 3. 컴포넌트 변경

### 신규
- `src/components/quiz/QuizGenerateModal.tsx` — B2+B3 통합 모달. 3 step:
  1. 옵션 입력 (주제/파일 + 난이도 세그먼트 + 문항 수 칩 + "과거 퀴즈 재사용" 탭)
  2. draft 편집 (QuizDraftEditor 내장)
  3. 저장 완료 → 모달 닫기
- `src/components/quiz/QuizDraftEditor.tsx` — 문항별 카드 리스트 (question text input, 4 option inputs, answer radio, delete btn) + "+ 문항 추가" 버튼 (10개 상한).
- `src/components/quiz/QuizReportModal.tsx` — 상단 요약(3 숫자) + 학생×문항 매트릭스 + CSV 다운로드 버튼. 빈 상태 처리.
- `src/components/quiz/QuizLibraryList.tsx` — 과거 퀴즈 리스트(제목+생성일+문항수+학급). 페이지네이션 "더 보기".

### 수정
- `src/components/QuizBoard.tsx` — 생성 버튼이 QuizGenerateModal 을 연다(기존 단일 폼 치환). "리포트 보기" 버튼 추가(status='finished' 또는 제출 기록 존재 시 활성). "편집" 버튼 추가(status='waiting' 일 때만).

### 상태 위치
- 옵션 값(difficulty, questionCount) — client (useState)
- draft JSON — client (서버 저장 전)
- 저장 후 Quiz — server (Prisma) + SWR `mutate` 로 재조회
- 리포트 데이터 — server (API 호출 시 매번 fresh, 캐싱 없음 — MVP)

## 4. 데이터 흐름

### B1 리포트
```
[교사] QuizCard "리포트" 클릭
  → QuizReportModal 오픈
  → GET /api/quiz/[id]/report
    → canManageQuiz 검증
    → db.quiz.findUnique(include: questions, players: { include: student, answers }})
    → 메모리에서 matrix 구성 + 요약 계산
    → JSON 반환
  → 모달: 요약바 + 매트릭스 렌더
[교사] "CSV 다운로드"
  → GET /api/quiz/[id]/report.csv
    → 동일 쿼리 → CSV 문자열 + \uFEFF prepend
    → Content-Disposition: attachment; filename="quiz-{id}-report.csv"
```

### B2+B3 생성/편집
```
[교사] "+ 퀴즈" → QuizGenerateModal (step1)
  → 옵션 입력 + "생성"
  → POST /api/quiz/draft (FormData)
    → canAddCardToBoard 검증
    → generateQuizFromText(text, apiKey, questionCount, provider, difficulty)
    → slice(0, questionCount) 클램프
    → JSON 반환 (DB 미저장)
  → step2: QuizDraftEditor 에 draft 주입
[교사] 편집 후 "저장"
  → POST /api/quiz/create (FormData, draftQuestions 포함)
    → 기존 로직: roomCode 생성 + Quiz+QuizQuestion 저장 (LLM 스킵)
  → 성공 → 모달 닫기, board mutate
[교사] 기존 퀴즈 "편집"
  → QuizDraftEditor 오픈 (기존 questions 로드)
  → "저장" → PUT /api/quiz/[id]/questions
    → 트랜잭션: 기존 QuizQuestion delete + 신규 create
```

### B4 재사용
```
[교사] QuizGenerateModal step1 에서 "과거 퀴즈" 탭
  → GET /api/quiz/library?cursor=...
  → QuizLibraryList 렌더
[교사] 퀴즈 선택 + "이 퀴즈 재사용"
  → POST /api/quiz/[id]/clone { boardId: currentBoard }
    → canManageQuiz(sourceId) 검증
    → 트랜잭션: 새 roomCode + 새 Quiz(parentQuizId=source) + questions copy
    → 신규 Quiz 반환
  → board mutate → 섹션에 QuizCard 노출
```

## 5. 엣지케이스

1. **LLM 타임아웃/429 (draft)** — `/api/quiz/draft` 500 반환. 모달 step1 에서 "다시 시도" 버튼 + 토스트. draft 엔드포인트가 실패해도 DB 상태 영향 0.
2. **LLM 문항 수 ≠ 요청** — auto 모드는 반환값 수용 (20 cap). fixed 모드는 `slice(0, N)` 후 부족하면 `{error: "insufficient", received: n, requested: N}` 반환, 클라이언트는 "LLM 이 적게 생성했습니다. 다시 시도?" 표시. auto 모드가 0개 반환 시 `{error: "empty"}` 로 재시도 유도.
3. **draft 편집 중 탭 닫기** — `beforeunload` 리스너로 "저장하지 않은 변경이 있습니다" 경고. localStorage 자동 저장은 OUT.
4. **동시 편집 (B3)** — 한 퀴즈를 두 교사가 동시에 PUT → 마지막 저장 승리. 트랜잭션으로 일관성만 보장, optimistic lock 없음 (솔로 프로젝트 범위). 같은 교사 동일 퀴즈 2탭도 동일.
5. **권한 누수** — 모든 신규 API 는 `canManageQuiz` 또는 `canAddCardToBoard` 통과 필수. 학생/학부모 접근 시 403. 비로그인은 401.
6. **빈 리포트** — QuizAnswer row 0건일 때 `summary.submittedCount=0`, players 빈 배열. UI 에서 "아직 제출 기록 없음" 빈 상태 렌더.
7. **대용량 리포트** — 학생 30명 × 문항 20 가정 (재미용 퀴즈 최대 케이스). 네트워크 페이로드 약 30*20*150B ≈ 90KB. 렌더는 정적 표, 가상화 불필요. 매트릭스 가로 스크롤 필수 (이름 sticky).
8. **CSV 한글 깨짐** — `\uFEFF` BOM prepend + `text/csv; charset=utf-8`. Excel 2019 한글판 검증(phase9 QA).
9. **parentQuizId 원본 삭제** — FK 없음 → clone 에 parentQuizId 값만 남고 JOIN 시 null. "(원본 삭제됨)" 표시는 OUT (UI 에 원본 링크 표시하지 않음).
10. **clone 체인 루프** — UI 에서 parentQuizId 추적은 1단계만 표시. DB 는 체인 허용.
11. **생성 중 이탈** — draft 단계에서 "돌아가기" 클릭 시 경고 모달. 풀이 중인 live 세션(`status=active`) 에서 편집 시도 시 "진행 중인 퀴즈는 편집 불가" 에러.

## 6. DX 영향

### 타입
- `src/types/quiz.ts` (신규): `QuizDraft`, `QuizReportPayload`, `QuizLibraryItem` 인터페이스.
- Prisma 스키마 변경 → `npx prisma generate` 후 타입 전파.

### 린트 / 테스트
- 새 API 라우트는 기존 패턴 따름 (`NextResponse` + try/catch).
- 단위 테스트: `lib/quiz-permissions.test.ts` (canManageQuiz happy+deny path).
- 기존 테스트 영향 없음 (Quiz 컬럼 추가만, 기존 read 경로 무변화).

### 빌드 / 배포
- `prisma generate` → `next build` 순서 유지.
- 마이그레이션 1건 — `prisma migrate deploy` in deploy script.
- Supabase pgbouncer 영향 없음 (컬럼 추가만, lock 최소).

## 7. 롤백 계획

| 시나리오 | 조치 |
|---|---|
| 배포 직후 런타임 에러 | Vercel rollback to 이전 deployment. DB 컬럼은 남지만 nullable 이라 기존 코드 무영향. |
| 마이그레이션 실패 (네트워크/권한) | `prisma migrate resolve --rolled-back` + 코드 revert. 이 케이스에서 down migration SQL 필요 → migration 파일에 `-- Manual rollback: ALTER TABLE "Quiz" DROP COLUMN "difficulty", DROP COLUMN "parentQuizId";` 주석 포함. |
| draft 엔드포인트가 API 키 누출 로그 | 로그에서 apiKey 키 필터링 확인(기존 `/create` 와 동일 패턴). 문제 시 해당 log sink sanitize. |
| 리포트가 대용량 payload 로 timeout | 클라이언트에서 페이지네이션 추가 (문항 10개 초과 학급 없어 당장 불필요). 최악은 CSV 다운로드만 enable 하고 matrix 숨김. |
| clone 체인 무한 생성 (스크립트 악용) | clone 엔드포인트 rate limit — MVP 에서는 교사 세션 기반이라 공격면 낮음. 필요 시 per-user 분당 10건 제한 추가. |

복구 우선순위:
1. **B1 (리포트)**: 읽기 전용. 롤백 = 배포 revert 만.
2. **B3 (draft/edit)**: 새 엔드포인트. 롤백 시 교사는 기존 즉시 생성 UX 로 폴백.
3. **B4 (clone)**: 롤백 시 교사는 수동 재생성.
4. **B2 (옵션)**: UI 만 롤백. 기본값(중간/5) 로 폴백.

---

## 자가 체크 (phase3 게이트)
- ✅ 데이터 모델 + 마이그레이션 전략
- ✅ API req/res 명세
- ✅ 컴포넌트 트리 + 상태 위치
- ✅ 데이터 흐름 다이어그램 (4 블록 전부)
- ✅ 엣지케이스 11개 (≥5)
- ✅ DX 영향 (타입/린트/빌드)
- ✅ 롤백 계획 시나리오 5개
- ✅ TODO/TBD 부재
