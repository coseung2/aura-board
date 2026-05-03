# Handoff Note — 수행평가 자동채점 v1 (performance-assessment-autograde)

## 배경

Aura-board 교사들은 지금까지 수행평가를 인쇄 배부 → 수기 채점 → 엑셀 성적 입력 → 학부모 통보로 수동 처리하고 있었다. 이번 피처는 출제·응시·채점·확정·공개를 **단일 보드 앱 안에서 완결**한다: MCQ는 서버 결정론적 매칭, SHORT는 Gemini 2.5 Flash가 1차 제안을 내고 교사가 확정. 화면이탈 잠금은 Supabase에 영속화되어 새로고침으로 우회할 수 없으며, 교사 "릴리스" 클릭 시 Aura 웹앱 성적탭으로 Realtime 반영된다. v1은 MCQ + SHORT 2종으로 스코프를 잠그고, OX·NUMERIC·ESSAY는 schema-only로 남겨 create API Zod gate가 차단한다.

## 참조 문서 필수 독해

아래 순서로 반드시 읽고 작업을 시작:

1. `ideation/plans/seeds-index.md` — 전체 결정 맥락과 본 시드의 위치
2. `ideation/plans/tablet-performance-roadmap.md` — 강제 성능 예산 (갤럭시 탭 S6 Lite 기준)
3. `ideation/plans/assessment-autograde-roadmap.md` — 본 피처의 단계별 구현 로드맵 (신규)
4. `ideation/plans/assignment-board-roadmap.md` — 기반이 되는 과제 보드 설계 (확장 관계)
5. `ideation/plans/parent-viewer-roadmap.md` — 학부모 뷰어 RLS·공개 정책 규약
6. `ideation/tasks/2026-04-16-performance-assessment-autograde/phase3/decisions.md` — Ouroboros 인터뷰로 확정된 모든 미결 답변
7. `ideation/tasks/2026-04-16-performance-assessment-autograde/phase4/seed.yaml` — 시드 원본 (이 문서의 Source of Truth)

## 기준 단말·제약

- **갤럭시 탭 S6 Lite (Chrome Android, S-Pen)** — 성능 예산 강제. S-Pen 캔버스 60fps 유지, OCR은 클라우드 오프로드 (디바이스 온-디바이스 OCR 금지).
- **iframe 금지** (Aura-board 원칙 계승) — 외부 임베드 0.
- **반 공개 기본** — 성적은 `Classroom.gradebookReleasePolicy=teacher_manual` 고정. 교사의 별도 "릴리스" 버튼 클릭 전까지 학생·학부모 모두 비노출.
- **매트릭스 뷰는 owner+데스크톱 전용** — `/teacher/assessments/:id/gradebook`는 학생·학부모·태블릿에서 모두 차단 (라우팅 가드 + RLS 양측).
- **Supabase 단일 프로젝트 공유** (Aura-board ↔ Aura 웹앱) — RLS 3분화(teacher/student/parent) 필수.
- **문항 유형 v1 잠금** — MCQ·SHORT만. OX·NUMERIC·ESSAY는 schema-only, create API Zod gate로 차단.
- **자동 제출·자동 처벌 금지** — 시간초과 cron 외에는 자동 상태전이 없음. 잠금 중에도 타이머는 계속 흐름 (`endAt = startedAt + durationMin` 고정).
- **padlet feature 파이프라인으로 진입** (`padlet/prompts/feature/_index.md`).

## 이번 작업 (seed.goal)

Aura-board 수행평가 자동채점 파이프라인 v1 구현 — MCQ 결정론적 채점 + SHORT 문항 Gemini 2.5 Flash LLM 채점, 화면이탈 잠금(Supabase 영속화), Pro 티어 게이트(런칭 플래그), `teacher_manual` 성적 공개 정책을 포함한 완전한 채점·감독 시스템 구축. 타임라인 8~10주.

## 수용 기준 체크리스트 (seed.acceptance_criteria 1:1 복사)

- [ ] AssessmentTemplate 생성 UI에서 MCQ·SHORT 2종만 문항 유형 드롭다운 노출 (OX·NUMERIC·ESSAY 차단)
- [ ] MCQ 문항 채점 시 `correctChoiceIds` ↔ `selectedChoiceIds` 서버 결정론적 매칭 동작, LLM 호출 없음
- [ ] SHORT 문항 채점 시 Gemini 2.5 Flash 호출, payload(`modelAnswers`+`keywords`+`partialCredit`) + rubric 전체 주입, 부분점수 산출 동작
- [ ] `partialCredit=false` 시 이진(전부맞음/전부틀림) 채점
- [ ] 화면이탈(Page Visibility API / `fullscreenchange`) 감지 시 즉시 `isLocked=true` + 교사 대시보드 배지 Realtime 푸시
- [ ] `isLocked` 상태가 AssessmentSubmission DB에 영속화되어 새로고침 후에도 잠금 UI 복원
- [ ] 학생 "돌아왔습니다" 모달 클릭 → unlock API → `isLocked=false` 해제 동작
- [ ] 교사 "재개 승인" 버튼 → unlock API + Realtime broadcast → 학생 UI 즉시 해제 동작
- [ ] 잠금 상태에서 타이머 계속 진행, UI dim + "잠금 중 — 시간은 계속 흐릅니다" 텍스트 표시
- [ ] ProctorEvent 전수 기록 (`type`, `durationMs` 포함)
- [ ] `FeatureFlag.assessmentTierGate=false` 시 전 사용자 접근 가능, `true` 시 Pro만 접근
- [ ] 교사가 릴리스 버튼 클릭 전까지 학생·학부모 GradebookEntry 비노출
- [ ] 채점 실패 5회 시 `retry_exhausted` 배지 표시
- [ ] SHORT 문항 교사 UI에 모범답안(필수)·키워드(선택)·부분점수 체크박스·루브릭 자연어(선택) 4필드 폼 렌더
- [ ] RLS 정책 준수: teacher=Classroom owner, student=자기 `visibleToStudent`, parent=ParentChildLink active + `releasedAt IS NOT NULL`
- [ ] unlock API RLS: teacher 또는 본인 student만 호출 가능
- [ ] 감사 로그 보관 Free=1학기, Pro=학년
- [ ] 동의서 미제출 학생 손글씨 입력 비활성화

## 주의

- **padlet feature 파이프라인 검증 게이트 전 항목 통과 필수** (`padlet/prompts/feature/_index.md`). phase0 analyst가 이 request.json을 소비하여 진입.
- **구현 중 결정이 흔들릴 경우 임의 결정 금지** — ideation 측에 재인터뷰 요청. 특히 문항 유형 확장(OX·NUMERIC·ESSAY), 자동 제출·자동 처벌, LLM 프로바이더 교체, 잠금 해제 권한 확장은 **스코프 오버플로우**로 즉시 중단 대상 (`seed.exit_conditions.scope_overflow`).
- **ideation 문서는 읽기 참조용**. `ideation/` 폴더 수정이 필요하면 ideation 에이전트에게 요청.
- **Aura 웹앱 성적탭 수신은 이 request 범위 밖**. phase7 dispatcher가 aura 프로젝트 INBOX로 별도 handoff를 송출한다 — padlet 측은 Supabase `GradebookEntry` write + Realtime broadcast까지만 책임지면 되고, aura 측이 Realtime 구독·성적탭 렌더·RLS parent view를 책임진다.

## 교차 프로젝트

본 피처는 **padlet(Aura-board)과 aura(Aura 웹앱) 양쪽에 수신자**가 있다. padlet이 주(主) 수신자이고, aura는 성적탭 반영 쪽만 담당한다.

### Aura 웹앱 측 수신 작업 요약 (phase7 dispatcher가 aura INBOX로 별도 송출)

- `/aura-web/gradebook` 성적탭: Supabase Realtime Postgres Changes 구독 (channel `assessment:{id}`)
- `GradebookEntry.releasedAt IS NOT NULL` 필터링 기반 학생·학부모 뷰 렌더
- parent view: `ParentChildLink active + releasedAt IS NOT NULL` RLS 정책 준수
- 교사 "릴리스" 이벤트 수신 시 p95 < 500ms 이내 UI 반영

### 양쪽 공통 규약 (Source of Truth = 이 시드)

| 항목 | 규약 |
|---|---|
| **Supabase** | 단일 프로젝트 공유. 스키마 migration은 padlet 쪽이 owner. aura는 read-only 소비자 원칙 + parent view 접근만. |
| **Realtime channel** | `assessment:{id}` — 채점 완료·잠금 상태·릴리스 이벤트 브로드캐스트. p95 < 500ms. padlet publish, aura subscribe. |
| **PGMQ** | `grading_retry` 큐 — padlet grading worker 전용. aura는 구독하지 않음 (재시도는 padlet 책임). |
| **FeatureFlag** | `assessmentTierGate` — 단일 source. 양쪽 앱이 같은 flag를 읽고 Pro 게이트를 동기화해야 함. 토글 시 양쪽 캐시 무효화 필요. |
| **RLS 3분화** | teacher=Classroom owner / student=자기 `visibleToStudent` / parent=`ParentChildLink active + releasedAt IS NOT NULL`. 양쪽 앱이 동일 정책을 전제. |
| **gradebookReleasePolicy** | `teacher_manual` 고정. 릴리스 버튼은 padlet 측에만 존재. aura는 `releasedAt` 컬럼으로만 공개 여부 판단. |
| **ProctorEvent·autoRawResponse** | padlet 전용 감사 데이터. aura에 노출하지 않음. |
| **감사 로그 보관** | Free=1학기, Pro=학년. 양쪽 앱 모두 이 retention을 전제로 쿼리 설계. |

aura 측 handoff는 별도 노트(phase7에서 생성)로 전달되며, 본 노트는 참조·정합 확인용이다.
