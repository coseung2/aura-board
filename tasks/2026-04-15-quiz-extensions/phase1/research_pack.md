# Phase 1 — Research Pack (quiz-extensions)

task_id: 2026-04-15-quiz-extensions
scope: 4블록 (B1 리포트 / B2 생성옵션 / B3 draft·edit / B4 재사용)

교실 퀴즈 UX는 Kahoot! / Quizizz / Google Forms Quizzes 3개가 사실상 표준. 각 제품이 4블록에 대해 어떤 패턴을 쓰는지, 어디서 막히는지 정리한다. 실브라우저 캡처는 이 세션에서 수행하지 못했고 (헤디드 Chromium 비활성) 공개 도큐먼트/UI 가이드 기반으로 정리 — `benchmark_index.json` 의 URL 은 다음 phase 에서 필요 시 재수집 가능.

---

## B1 — 리포트 / Analytics

### Kahoot Reports
- **포맷**: 요약 카드(정답률/소요시간/선두학생) → 학생×문항 매트릭스 → 문항별 오답 분포 3탭
- **CSV**: "Download report" 한 버튼 → 엑셀 파일(요약/문항/학생 3시트)
- **장점**: 3단 드릴다운. 교사가 "누가 못 푸는지" vs "어떤 문항이 문제인지" 분리해 볼 수 있다.
- **단점**: 단일 세션만 비교. 같은 퀴즈 여러 세션 시계열은 별도 메뉴.

### Quizizz Reports
- **포맷**: 매트릭스 메인(학생 행 × 문항 열, 셀 색으로 정답/오답/미응답)
- **특징**: 문항 클릭 → 해당 문항 드롭다운에서 학생별 선택지 분포
- **장점**: 한 화면으로 훑기 쉽다.
- **단점**: 반 인원 30+ 일 때 가로 스크롤이 길다.

### Google Forms Quizzes
- **포맷**: 질문별 막대차트 + 자주 틀린 문항 상단 표시. 학생별 drill-down 은 2클릭.
- **단점**: 시간(응답 속도) 지표 없음. 우리 스키마는 `timeMs` 가 있으니 여기서 차별화 가능.

### 우리 구현 방향
- **매트릭스 메인** (Quizizz 계열) + 요약 상단 바 (Kahoot 계열) — 모달 단일 뷰로 합침.
- CSV는 단일 시트 (학생 × 문항 + 총점/평균시간). B1 스코프 단순화.
- 시간 컬럼은 평균 소요시간만 먼저 노출. 문항별 시간 분석은 B1 이후 별도 task.

---

## B2 — 생성 옵션 UI

### Kahoot AI Generator
- **옵션**: 주제 (free text), 난이도 (easy/medium/hard), 문항 수 (5/10/15/20), 언어
- **UI**: 한 화면 form 단일 step. "Generate" 버튼 누르면 draft 편집화면으로 직행.

### Quizizz AI ("Quizizz AI")
- **옵션**: 주제, 학년(grade), 난이도, 문항 수. "Quick create" vs "Customize" 2 entry.

### Gamma / Magic School
- **옵션**: 문제 유형 (MCQ/TF/SA) 까지 노출. 우리 스코프 out.

### 우리 구현 방향
- 한 화면 모달. 필드: 주제(필수) + 난이도(3단계 세그먼트) + 문항 수(3/5/10 3칩). 보기 수는 4지 고정이므로 UI 노출 X.
- 기본값: 난이도 "중간" + 문항 수 5.
- LLM 프롬프트에 `{difficulty}` / `{questionCount}` 치환. 문항 수는 서버에서 클램프(3~10).

---

## B3 — Draft / Edit Flow

### Kahoot 편집기
- **단계**: AI 생성 → draft 저장 → 편집기(questions list + 개별 편집 패널) → "Save and exit"
- **UX**: 문항 드래그 재정렬, "+ Add question", 개별 삭제.

### Quizizz 편집기
- Kahoot 유사. 추가로 정답 보기 표시 토글.

### Google Forms
- draft 개념 없이 실시간 저장 (autosave). 편집 후 "Release results" 플로우.

### 우리 구현 방향
- **draft 엔드포인트 분리**: `/api/quiz/draft` (LLM 호출 → JSON 반환, DB 미저장) + `/api/quiz/create` (draft JSON 수신 → 저장).
  - 근거: LLM 호출 중 실패 / 사용자 마음 변경 시 Quiz row 가 orphan 으로 남지 않음.
  - 대안 (기각): draft 도 DB 에 저장 + status='draft'. Quiz row 누적 + 정리 cron 필요. 솔로 프로젝트 범위 초과.
- **편집 UI**: 문항별 카드 (질문 text + 4보기 + 정답 라디오) + 삭제 버튼 + "+ 문항 추가" (빈 카드 insert). 드래그 재정렬은 B3 out, B4 이후.
- **PATCH**: `/api/quiz/[id]` — questions 배열 전체 교체 (개별 diff 추적 복잡도 회피).

---

## B4 — 재사용

### Kahoot "Duplicate"
- 퀴즈 상세 → 메뉴 → Duplicate → 내 라이브러리에 복사본 생성. 원본 link 없음.

### Quizizz "Reassign"
- 퀴즈 상세 → "Start new game" → 세션 이력 누적. 퀴즈 자체는 1개.

### 우리 구현 방향 (hybrid)
- **clone 방식**: `POST /api/quiz/[id]/clone` → 새 Quiz row (+ questions 복사), `parentQuizId` 로 원본 기록. 현재 섹션에 Card 로 노출.
  - 근거: Padlet 클론은 Card 단위 CRUD 라 "같은 퀴즈 여러 카드" 모델이 자연스러움.
- **세션 이력**: QuizSessionList 컴포넌트는 "과거에 만든 퀴즈" 리스트 (교사 본인 + 현재 학급). 클릭 → 재사용 여부 확인 → clone.
  - 대안 (기각): QuizSession 테이블 신설해 세션별 답안 묶음. 스코프 초과 — 현재 QuizAnswer + Quiz.createdAt 로 충분.

---

## 공통 리스크

1. **LLM 호출 실패** (B2/B3) — draft 엔드포인트가 500 반환 시 편집기 진입 불가. 재시도 버튼 필요.
2. **권한** — clone/PATCH/report 모두 `owner === currentUser` 또는 `학급 교사` 만 허용. 학생 접근 시 403.
3. **성능** — 리포트는 학생 30명 × 문항 10 = 300 QuizAnswer row 조회. index (`quizId`, `userId`) 확인 필요.
4. **CSV 인코딩** — 한글 깨짐 방지 UTF-8 BOM prepend.

## 결정 초안 (phase2 input)

- B1/B2: 즉시 병렬 착수. 스코프 작고 스키마 무변경.
- B3: `/api/quiz/draft` 분리 + PATCH 는 questions 전체 교체. Quiz.difficulty 컬럼 추가는 B2 와 함께 마이그레이션 1회.
- B4: clone + parentQuizId self-ref + 세션 이력 리스트.
