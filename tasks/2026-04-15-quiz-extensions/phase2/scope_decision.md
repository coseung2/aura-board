# Scope Decision — quiz-extensions

task_id: 2026-04-15-quiz-extensions

## 1. 선택한 UX 패턴

| Block | 패턴 ID | 채택 |
|---|---|---|
| B1 | P1-matrix-report + P2-csv-export-bom | 학생×문항 매트릭스 + 상단 요약 + 단일시트 CSV(UTF-8 BOM) |
| B2 | P3-single-step-gen-form | 단일 모달: 주제(text) + 난이도(3단 세그먼트) + 문항수(3/5/10 칩) |
| B3 | P4-draft-preview-edit + P5-inline-question-cards | LLM→draft JSON(미저장)→편집기→저장. 문항별 카드 리스트. |
| B4 | P6-clone-with-parent-ref + P7-past-quiz-picker | 교사 과거 퀴즈 리스트 → 선택 → clone (parentQuizId 기록) |

**사유**: research_pack "B1 우리 구현 방향" — Kahoot 요약바 + Quizizz 매트릭스 혼합. B2 "Kahoot AI" 단일 step 이 현재 즉시 생성 UX 와 연속성 높음. B3 draft-는-DB-저장-안-함은 orphan row 방지(solo 프로젝트 운영 부담 최소화). B4 clone 은 Padlet 클론의 "Card 단위 CRUD" 모델과 정합.

## 2. MVP 범위

### IN (이번 task)
- **B1 성적 리포트**: `GET /api/quiz/[id]/report`, `QuizReportModal` (매트릭스+요약바), CSV 다운로드 버튼(UTF-8 BOM).
- **B2 생성 옵션 UI**: 퀴즈 생성 모달에 난이도 세그먼트 + 문항 수 칩 추가. `/api/quiz/create` 가 `{topic, difficulty, questionCount}` 수신. LLM 프롬프트에 반영.
- **B3 Draft/Edit**: `POST /api/quiz/draft` (LLM 호출 → JSON 반환, 미저장), `POST /api/quiz/create` 를 draft JSON 수신해 저장하도록 리팩터, `PATCH /api/quiz/[id]` (questions 전체 교체), `QuizDraftEditor` 컴포넌트 (문항 추가/삭제/수정).
- **B4 재사용**: `POST /api/quiz/[id]/clone`, `QuizSessionList` 컴포넌트 (교사 본인이 만든 퀴즈 리스트 + 재사용 버튼). `Quiz.parentQuizId` self-ref 컬럼.
- **스키마 변경 (1회 마이그레이션)**: `Quiz.difficulty String?`, `Quiz.parentQuizId String?`. `Quiz.status` 는 이미 String 이므로 'draft' 값 추가 허용 (마이그레이션 불필요 — 그러나 B3 현 설계상 draft 는 DB에 들어가지 않아 실질 미사용).

### OUT (이번 task 제외)
- **QuizQuestion.options 배열화** — 4지선다 유지. 이유: 범위 폭발. 후속 task 필요 없음 (유지 결정).
- **문항 유형 확장 (TF/SA/Multi-select)** — 이유: LLM 프롬프트 + 채점 로직 전면 재설계. 후속 research task 가능.
- **문항 드래그 재정렬** (B3) — 이유: 추가/삭제만으로 MVP 충족. 후속 feature task (작은 규모).
- **교사 간 퀴즈 공유** (B4) — 이유: 권한 설계 복잡. 본인 + 같은 학급 교사만 허용 (현재는 본인만).
- **문항별 시간 분석 차트** (B1) — 이유: 평균 소요시간만 노출. 후속 feature.
- **퀴즈 세션(round) 개념 분리** — 이유: 현 데이터 모델 (Quiz + QuizAnswer.createdAt) 로 충분. 후속 필요 시 별도 task.
- **draft 자동 저장 (브라우저 로컬)** — 이유: localStorage 사용하면 B3 범위 내이지만 복잡도 상승. 초기판은 "편집 중 이탈 시 경고" 만.

## 3. 수용 기준 (Acceptance Criteria)

### B1 성적 리포트 (AC-B1-1 ~ 5)
1. **AC-B1-1**: 교사가 퀴즈 카드의 "리포트 보기" 버튼을 클릭하면 QuizReportModal 이 2초 이내(로컬 기준) 로드된다.
2. **AC-B1-2**: 리포트 상단에 3개 요약 숫자(제출 인원 / 평균 정답률 / 평균 소요시간 초)가 표시된다.
3. **AC-B1-3**: 리포트 본문에 학생(행) × 문항(열) 매트릭스가 렌더되며, 각 셀은 정답(녹색)/오답(빨강)/미응답(회색) 3색으로 구분된다.
4. **AC-B1-4**: "CSV 다운로드" 버튼 클릭 시 `quiz-{id}-report.csv` 파일이 받아지며, Excel 한글판에서 열었을 때 깨짐 없음(UTF-8 BOM).
5. **AC-B1-5**: 학생이 풀지 않은 퀴즈의 리포트는 "아직 제출 기록 없음" 빈 상태를 표시한다.
6. **AC-B1-6**: 교사 외 사용자(학생/학부모/비로그인)가 `/api/quiz/[id]/report` 에 접근하면 403.

### B2 생성 옵션 (AC-B2-1 ~ 4)
1. **AC-B2-1**: 퀴즈 생성 모달에 난이도 세그먼트(쉬움/중간/어려움, 기본값 중간)가 노출된다.
2. **AC-B2-2**: 문항 수 컨트롤이 2모드로 노출된다. 기본 "AI가 정함" (라디오 선택됨) / 대안 "직접 지정" → 선택 시 숫자 입력(1~20) 활성. 둘 중 하나만 활성.
3. **AC-B2-3**: "AI가 정함" 모드에서는 서버가 LLM 에 "내용 길이에 맞는 적절한 수의 문항(최대 20개)" 프롬프트 분기. 반환 결과를 그대로 수용하되 20개 초과분은 `slice(0, 20)` 으로 cap. "직접 지정" 모드에서는 서버가 `1 ≤ n ≤ 20` 클램프 후 LLM 에 "정확히 n개" 지시, 부족 시 `{error: "insufficient"}` 반환.
4. **AC-B2-4**: 생성된 Quiz.difficulty 컬럼에 선택값이 저장된다. questionCount 는 저장하지 않음 (실제 저장된 문항 수는 QuizQuestion.count 로 조회 가능).

### B3 Draft / Edit (AC-B3-1 ~ 5)
1. **AC-B3-1**: "생성" 버튼 클릭 시 `/api/quiz/draft` 가 호출되며, 응답은 `{questions: [...]}` JSON 만 반환하고 DB에는 저장되지 않는다(Quiz count 무변화).
2. **AC-B3-2**: draft 응답 수신 후 `QuizDraftEditor` 가 노출되며, 각 문항은 카드 형태(질문 text input + 4 보기 input + 정답 라디오 + 삭제 버튼)로 렌더된다.
3. **AC-B3-3**: "+ 문항 추가" 버튼은 빈 문항 카드를 리스트 끝에 삽입한다(20개 상한, 상한 도달 시 비활성).
4. **AC-B3-4**: "저장" 클릭 시 `/api/quiz/create` 로 최종 draft JSON 이 전송되고, Quiz+QuizQuestion rows 가 생성된다. 저장 성공 후 모달 닫히고 해당 섹션에 QuizCard 가 노출된다.
5. **AC-B3-5**: 기존 퀴즈의 "편집" 버튼은 `PATCH /api/quiz/[id]` 를 호출해 questions 를 전체 교체한다. 본인 퀴즈 아닌 사용자 요청은 403.

### B4 재사용 (AC-B4-1 ~ 4)
1. **AC-B4-1**: 퀴즈 생성 모달에 "과거 퀴즈에서 재사용" 탭이 있으며, 교사 본인이 만든 퀴즈 리스트(제목/생성일/문항수)가 최신순으로 표시된다.
2. **AC-B4-2**: 리스트에서 퀴즈 선택 시 "이 퀴즈 재사용하기" 버튼이 활성화되고, 클릭하면 `POST /api/quiz/[id]/clone` 호출 후 현재 섹션에 새 퀴즈 카드가 생성된다.
3. **AC-B4-3**: clone 된 Quiz row 는 `parentQuizId` 에 원본 ID 를 보존한다(확인 쿼리 가능).
4. **AC-B4-4**: 본인 아닌 퀴즈 clone 요청은 403 (학급 교사 공유는 OUT).

## 4. 스코프 결정 모드

**Selective Expansion** — 4블록 전부 포함. 각 블록은 독립 배포 가능하도록 설계 (B1+B2 선배포, B3, B4 순차).
각 블록의 내부 범위는 Reduction 기조 (드래그 재정렬, 문항 유형 확장, 교사 공유 등 명시적 OUT).

## 5. 위험 요소

1. **LLM 호출 실패(B2/B3)**: OpenAI/Anthropic API 타임아웃·레이트리밋 시 draft 엔드포인트 500. → 편집기 진입 전 "재시도" 버튼 + 에러 토스트. 이미 `/api/quiz/create` 에서 구현된 에러 핸들링 패턴 재사용.
2. **LLM 문항 수 불일치(B2)**: LLM 이 요청 수보다 많거나 적게 생성할 수 있음. → 서버에서 `slice(0, questionCount)` 로 클램프, 부족 시 에러 반환(재생성 UX).
3. **권한 누수(B1/B3/B4)**: `/api/quiz/[id]/report|clone`, `PATCH /api/quiz/[id]` 모두 `owner === session.userId` 체크 필수. 학생/학부모 접근 시 403. 특히 학급 외부 학생/학부모가 ID 추측 접근 가능 — 서버 사이드 권한 체크 단일 지점(`lib/auth/canAccessQuiz.ts` 신설 권장).
4. **리포트 쿼리 성능(B1)**: 학생 30 × 문항 10 = 300 QuizAnswer row. `@@index([quizId, userId])` 존재 여부 확인 필요(phase3 architect). 없으면 마이그레이션에 포함.
5. **CSV 한글 깨짐(B1)**: UTF-8 BOM(`\uFEFF`) prepend 필수. Excel 2019 이상 한글판에서 검증.
6. **draft 상태 소실(B3)**: 편집 중 브라우저 탭 닫힘. MVP 는 "beforeunload 경고" 로만 대응. 자동 저장은 OUT.
7. **parentQuizId 순환(B4)**: 클론의 클론의 클론... 시 self-ref 체인 무한. → UI 에서 "원본" 표시는 1단계만, DB 는 체인 허용(쿼리 시 follow 안 함).
8. **Quiz.status 'draft' 미사용**: phase0 에서 제안됐으나 B3 draft 는 DB 미저장으로 설계 — `status='draft'` 값 쓰지 않음. 스키마 오염 방지 위해 'draft' 값 추가 자체를 SKIP. `status` 는 기존 값(active/closed) 유지.

---

## 스코프 게이트 자가 체크

- ✅ 수용 기준 ≥ 3개 (총 19개)
- ✅ 리스크 분석 ≥ 1개 (총 8개)
- ✅ 필수 섹션 5종 전부 포함
- ✅ TODO/placeholder/TBD 부재 확인
