# Decisions — 수행평가 자동채점 파이프라인 (Aura-board → Aura 웹앱)

Interview: `interview_20260415_223155`
Ambiguity: **0.15** (≤ 0.2 게이트 통과)
작성: 2026-04-16 (phase3 / interview-facilitator)
입력: phase2/sketch.md, phase1/exploration.md, plans/seeds-index.md, MEMORY.md

---

## 0. AskUserQuestion 필수 항목 (⚠️ 사용자 확정 대기)

| # | 항목 | 잠정 디폴트 | 확정 필요 근거 |
|---|---|---|---|
| **U1** | 수행평가 기능의 Free/Pro tier 배치 | **Pro 전용. Free는 월 1회 trial (같은 학급 내 1개 AssessmentTemplate/월)** | 가격·수익 전략은 에이전트 판단 영역 밖 |
| **U2** | 서술형 LLM 1순위 제공자 | **Gemini 2.5 Flash ($0.15/$0.60, 1M ctx)**, 프로바이더 추상화로 Claude Haiku 4.5 교체 옵션 제공 | 벤더 락인·개인정보 국외 이전 정책은 사용자 결정 |
| **U3** | 부정행위 감지 시 정책 | **교사 알림만 (ProctorEvent INSERT only, 상태머신 전이 없음)**. 시간 제한 초과만 서버 cron 자동 전이 예외 | 교실 현장 문화·학부모 민원 감내 수준은 사용자 결정 |
| **U4** | 성적 공개 타이밍 기본값 | **`Classroom.gradebookReleasePolicy="teacher_manual"` — 별도 "릴리스" 버튼 후 학부모·학생 공개** | 학부모 공개 속도 vs 교사 통제권 trade-off |
| **U5** | v1 문항 유형 스코프 | **MCQ + OX + NUMERIC + SHORT 4종. ESSAY는 schema-only, UI off, v1.5 활성** | 타임라인·품질 게이트·LLM 비용 상한 연쇄 |

> ⚠️ **사용자 응답 전까지 위 5개는 "잠정"**. phase4 seed 생성 시 디폴트로 고정하되, phase5 integrate 직전 사용자 재확인 포인트 권고.
> AskUserQuestion 도구가 현재 세션에서 비활성이라 인터뷰 내 디폴트 기반 진행. 사용자 접촉 가능 시점에 U1~U5 일괄 확인 필요.

---

## 1. 확정된 결정 (phase3 인터뷰 산출)

### 1.1 핵심 아키텍처 (인터뷰 확정)

| # | 미결 | 결정 | 근거 |
|---|---|---|---|
| Q1 | Aura-board ↔ Aura 웹앱 Supabase 공유 | **동일 프로젝트 공유 (D1)** | parent-viewer v2가 이미 공통 Supabase 전제. Realtime p95 < 500ms 요구는 D1만 충족. 분리 시 RLS 이중 관리·PAT 웹훅 2~3주 추가. 전략적 분리 이유 없음 |
| Q5 | 성적탭 UI 위치 | **2곳 운영: Aura 웹앱 신규 route `/aura-web/gradebook` (학생·학부모용) + Aura-board 내부 `/teacher/assessments/[id]/gradebook` 교사 매트릭스 (owner+데스크톱 전용)** | 교사는 출제·채점 컨텍스트에서 매트릭스 조작(assignment-board와 연속), 학부모는 Aura 웹앱 단일 자녀 뷰. 매트릭스는 viewer·editor·태블릿 제외 원칙 |
| Q6 | v1 문항 유형 스코프 | **MCQ+OX+NUMERIC+SHORT (4종)**. ESSAY는 schema 유지·UI off, v1.5 | U5 디폴트. ESSAY는 OCR 판독 불가·LLM 오채점 리스크 대처 파일럿 검증 필요 |
| F-policy | 부정행위 v1 정책 | **B. 교사 알림만** (자동 잠금·자동 제출 없음). 시간 제한 초과만 서버 cron이 in_progress→submitted 자동 전이 (부정행위 아닌 객관적 사실) | U3 디폴트. 오탐(false positive) 리스크·학부모 민원 리스크·BYOD 기본 환경 |

### 1.2 승계·일관 정책 (에이전트 자율 확정)

| 항목 | 결정 | 근거 |
|---|---|---|
| RLS 주체 3분화 | teacher=Classroom owner, student=본인 GradebookEntry(visibleToStudent), parent=ParentChildLink active + releasedAt IS NOT NULL | parent-viewer v2 패턴 승계 (seed_6d7077aac472) |
| 매트릭스 뷰 스코프 | **owner + 데스크톱 전용**. editor(학생)·viewer(학부모)·태블릿 차단 | MEMORY matrix_desktop_only 방침 |
| 반 공개 기본 | Classroom 전체 학생에게 수행평가 게시 기본, 개별 비공개는 v1.5+ | MEMORY class_default_open |
| AI 제안 노출 정책 | 교사 확정 전 제안(suggestion)은 학생·학부모에게 **완전 비공개**. `AssessmentAnswer.autoRawResponse`는 감사용 보관 | known_constraint 준수 |
| LLM 벤더 추상화 | `src/lib/grading/providers/{gemini,openai,claude}.ts` 레이어 필수. 기본 gemini-flash, template별 오버라이드 | 벤더 락인 방지·Promptfoo 회귀 |
| 성적 송신 레이턴시 | p95 < 500ms (확정 클릭 → Aura 웹앱 성적탭 표시) | D1 Realtime 성능 기준 |
| 재시도 큐 | PGMQ `grading_retry` 큐, exponential backoff 2·4·8·16·32s, 5회 실패 시 retry_exhausted 배지 | R8·R1 완화 |
| IndexedDB 동기화 | `idb-keyval` 로컬 draft + 300ms debounce autosave, 재접속 시 diff 머지. `localDraftHash` 무결성 검증 | R3 완화, tablet-performance §3 재사용 |
| OCR 경로 | **클라우드 오프로드 전용**. Tesseract.js·온디바이스 금지. tldraw/perfect-freehand PNG → Gemini Vision 1-round-trip | tablet-performance §2a 준수 |
| iframe 예산 | 응시 화면 **iframe 0**. 전체 보드 동시 마운트 ≤ 1 | tablet-performance §2a |
| 문항 lazy 마운트 | 현재 문항 ± 1개만 DOM 유지. 30문항 × 4보기 일괄 렌더 금지 | Snapdragon 720G TTI < 3s |
| S-Pen 캔버스 | tldraw/perfect-freehand 고정 픽셀 800×400, 60fps, 입력 이벤트 직결 (throttle 없음) | 기준 단말 스펙 |
| 제출물 청크 업로드 | 문항별 background flush, 제출 버튼에서 일괄 업로드 금지 | 네트워크 단절 대응 |
| Realtime 구독 스코프 | 학생=자기 submission만, 교사 proctor 대시보드=templateId scope. 보드 전체 ChangeFeed 금지 | 트래픽·RLS 비용 최적화 |
| 루브릭 UX | 템플릿 `rubricText` 자연어 자유 입력 + 문항 `rubric` override. LLM 프롬프트에 그대로 주입 | 교사 학습곡선 최소화 |
| AI 문항 생성 보조 | v1 포함. 교과서 단원 paste → Gemini Flash 초안 N개 → 교사 편집·확정. `aiGeneratedBy`·`aiSourcePrompt` 메타 보관 | sketch 부록 자율 결정 후보 기본값 유지 |
| 제출 후 재응시 락 | `AssessmentSubmission.status='submitted'` 이후 PATCH 거부. 재시험은 별도 템플릿·별도 레코드 | L3 방어 |
| Service Worker 방어 | 응시 중 외부 도메인 fetch 화이트리스트(same-origin + Supabase + Storage만). 이탈 시 `window_open_blocked` 유사 로그 | L3 |
| 감사 로그 수준 | `AssessmentAnswer.autoRawResponse` (프롬프트+응답), `ProctorEvent` 전수, `accessId` 열람 이력. 1학기 보관 | 이의제기·개인정보보호법 |
| 개인정보 보관 기간 | Free=1학기, Pro=학년 단위 + CSV/PDF export. 경과 시 자동 파기(Supabase cron) | R7·Tier 차별화 |
| 동의서 수령 | 학기 초 학부모 일괄 동의 (LLM 국외 이전·손글씨 처리·성적 열람 3건 묶음). 미동의 학생은 키보드 입력만 허용 | 개인정보보호법 |
| 부정행위 임계값 | v1 고정 (🟢=0~1, 🟠=2, 🔴=3+). 교사 조정 UI는 v1.5 | U3 디폴트 연장 |
| Knox Kiosk L4 | v1은 **UI 플래그 + 가이드 문서만** (실 MDM 연동 0). 플래그=`Classroom.schoolManagedDevices && AssessmentTemplate.kioskMode` | BYOD 기준·실 MDM은 v2+ |
| 비용 대시보드 | 관리자 전용 `/admin/llm-cost` 별도. 교사·학생·학부모 비노출 | 운영 관리용 |
| Sentence-Transformers 전처리 | KR-SBERT 코사인 유사도 < 0.25 또는 10자 미만 답안은 자동 0점 (LLM 호출 스킵). 비용 절감 | R8·경험적 임계값, Promptfoo 회귀로 조정 |
| 교사 매트릭스 가상 스크롤 | 학생 × 문항 > 30×30 시 react-virtual 적용. 데스크톱 전용이라 성능 여유 있음 | 대규모 학급 대응 |
| 학부모 알림 채널 | v1은 Aura 웹앱 PWA 푸시 (OneSignal 또는 Supabase Edge Function + FCM). 이메일·문자 v1.5 | parent-viewer v2 채널 승계 |
| 학기 종료 export | CSV + PDF 2종. PDF는 Puppeteer/chromium 서버 렌더. Pro tier 전용 | R7·Tier |
| v1 타임라인 | 6~8주 + L1·L2·L3 보안 1~1.5주 + Promptfoo 회귀 0.5주 = **총 8~10주** | sketch §10 견적, scope③ 기준 |

### 1.3 데이터 모델 최종 확정 (sketch 유지 + 인터뷰 반영)

| 변경 | 위치 | 내용 |
|---|---|---|
| `AssessmentQuestionKind` enum | phase2 sketch 그대로 유지 | MCQ·OX·NUMERIC·SHORT·ESSAY 5종 모두 schema 유지, ESSAY는 **UI 노출 v1.5** 플래그로만 막음 |
| `AssessmentSubmission.status` | 신규 전이 1건 추가 | `in_progress → submitted` 에 **서버 cron 자동 전이 케이스**(durationMin 초과) 명시. proctor 이벤트로 인한 자동 전이는 **없음** |
| `Classroom.gradebookReleasePolicy` | 기본값 확정 | `"teacher_manual"` (U4 디폴트) |
| `AssessmentTemplate.gradingProvider` | 기본값 확정 | `"gemini-flash"` (U2 디폴트), 프로바이더 추상화로 교체 가능 |
| `AssessmentTemplate.kioskMode` | v1 의미 축소 | UI 플래그만. 실 MDM 연동 코드 없음 |

---

## 2. 파킹된 항목 (v1.5+ 또는 별 task)

| 항목 | 파킹 사유 | 재등장 시점 |
|---|---|---|
| ESSAY(논술·장문 서술) UI 활성 | Promptfoo 회귀·OCR·LLM 비용·이의제기 플로우 파일럿 필요 | v1.5 베타 플래그 |
| 자동 잠금/자동 제출 (부정행위 정책 A·C) | 오탐 리스크, 교사 조정 UI 추가 공수 | v1.5 요청 시 C(임계값 복합) 도입 |
| 부정행위 임계값 교사 조정 UI | v1 고정값 단순화 | v1.5 |
| 카메라 기반 AI 원격 감독 (F7) | 초중등 프라이버시·학부모 민원 | 파킹 (`ideas-parking-lot.md` 이관 권고) |
| 키스트로크 biometrics (F9) | S-Pen 중심·초등 표본 부족 | v3+ 중·고등 고부담 평가 |
| Knox Kiosk 실제 MDM 연동 | BYOD 기본 환경, 학교 단말 카트 보급 후 | v2+ Enterprise |
| Capacitor "Aura Board Tablet" 앱 + ML Kit Digital Ink | 순수 웹 유지 방침 | v2 네이티브 셸 검토 시 |
| Upstage Document OCR / CLOVA OCR (B2·B3) | Gemini Vision 통합으로 v1 불필요 | LLM 비용 폭주 시 전처리 단계 fallback |
| OneRoster 1.2 Gradebook Service (D7) | Aura 내부 통신 오버킬 | v2+ 외부 SIS 연동 |
| LTI 1.3 AGS (D6) | 자사 제품 간 연동엔 과중 | 외부 LMS 연동 시 |
| 쌤기부-style 생기부 문장 AI 생성 | 수행평가 채점 → 생기부 초안 | v1.5 파일럿 대상 |
| 이메일·문자 학부모 알림 | v1 PWA 푸시 우선 | v1.5 확장 |
| 교사 현장 감독용 모바일 대시보드 | owner+데스크톱 전용 원칙 | 별도 설계 task 필요 |

---

## 3. 새로 드러난 분기 (현재 세션 편입 금지, 기록만)

### 3.1 학부모 열람 경로 중복 가능성
- parent-viewer v2(seed_6d7077aac472)는 이미 Aura 웹앱 내 "자녀 단일 뷰"를 소유. 본 task의 GradebookEntry 학부모 뷰는 **parent-viewer v2 안의 "성적" 탭**으로 편입할지, 별도 route로 신설할지 미결.
- 결정권: phase5 integrate에서 parent-viewer roadmap 업데이트 또는 별 task로 분리.
- 현 phase3에서는 "parent-viewer v2와 같은 Aura 웹앱 내부·동일 RLS·동일 PWA 셸"로만 합의. UI 트리(탭 추가 vs 페이지 분리)는 integrate 단계 판단.

### 3.2 "수행평가 결과로 생기부 문장 자동 생성" 후속 파이프라인
- 쌤기부 벤치마크(E8) 기능. 수행평가 → 교사 확정 → LLM 문장 초안 생성 → 교사 편집 → NEIS export.
- 별 task로 분리 권고. 현 task 스코프 이탈.

### 3.3 Ambient proctoring via 학생 탭의 카메라 프리뷰 프라이버시 재설계
- 원격 감독(F7) 파킹 결정과 별개로, 교실 현장에서 교사가 "학생 탭 썸네일 grid"을 스크린샷 단위로 조회하고픈 요구가 F8 대시보드 설계 중 도출 가능성.
- 프라이버시·성능 비용 검토 필요. 현재는 기록만.

### 3.4 Pro tier 수행평가 학급 인원 과금 모델
- U1 "Pro 전용"로 잠정 확정 시 학급 인원·LLM 채점 월 상한 구조가 Free/Pro 단순 이분법으로 표현 어려움. Team/School tier 신설 여부 검토.
- 별 task 분리 후보.

### 3.5 Aura 웹앱 신규 route `/aura-web/gradebook` 설계 상세
- Q5 결정 "2곳 운영" 중 Aura 웹앱 측 UI 패턴(하이클래스 스타일 타임라인 vs Classroom 스타일 표)은 aura INBOX 이관용 별도 핸드오프 필요.
- phase6 handoff 시 `aura/INBOX/gradebook-ux-request.md` 동반 송출.

---

## 4. 인터뷰 메타

- 총 라운드: **3** (D1 확정 → scope③ 확정 → proctor-B 확정)
- 10라운드 제한 여유 충분.
- Ouroboros 리턴: `ambiguity: 0.15 / Ready for Seed generation`
- 에이전트 자율 답변: Q1(D1), Q5(2곳 운영), 1.2 승계 정책 전체
- 사용자 확정 필요(잠정 디폴트 사용, 에스컬 플래그): U1·U2·U3·U4·U5

## 5. phase4 seed 생성 입력 요약

- session_id: `interview_20260415_223155`
- scope: ③ MCQ+OX+NUMERIC+SHORT
- infra: D1 공통 Supabase + RLS + Realtime
- LLM: gemini-flash 기본, 프로바이더 추상화
- tier: Pro 전용 (U1 잠정)
- release: teacher_manual (U4 잠정)
- proctor: 알림만 (U3 잠정)
- 신규 엔티티 7 + Classroom·AssignmentSlot·Board 확장 (phase2 sketch 준수)
- 타임라인: 8~10주

Phase 3 완료. 다음 phase4 seed.

---

## 6. 사용자 확정 (2026-04-16, AskUserQuestion)

U1~U3·U5는 사용자가 응답함. U4는 묻지 않고 디폴트(teacher_manual) 유지.

| # | 항목 | 최종 확정 | 사용자 노트 | 디폴트 대비 변경 |
|---|---|---|---|---|
| **U1** | Tier 배치 | **Pro 전용 (최종). 단 개발·베타 기간에는 tier 게이트 off — 실질 전체 공개**. 정식 런칭 시점에 Pro gate enforce | "일단 프로로 하긴할건데, 지금은 다 열어둬" | 디폴트와 동일(Pro 전용). 플래그 `AssessmentTemplate.tierGate`를 런칭 플래그로 도입해 초기 비활성화 |
| **U2** | 채점 LLM | **Gemini 2.5 Flash (서술형 전용)**. MCQ는 LLM 없이 교사 등록 정답지 결정론 매칭. NUMERIC은 v1 스코프에서 제거됨(U5 반영). 프로바이더 추상화 유지 | "어차피 omr형태라면 교사가 미리 답 정해두면 ai없이 매칭만 해도 되긴 할듯. 서술형쪽에서 llm이 필요할거고" | 디폴트(Gemini) 유지. **MCQ LLM 호출 경로 제거 확정** — 결정론 매칭 전용. LLM 비용은 SHORT 서술형에서만 발생 |
| **U3** | 부정행위 정책 | **알림 + 자동 화면이탈 잠금** (하이브리드). Fullscreen/visibility-change 이벤트 발생 시 ① 답안 입력 영역 즉시 disable ② 교사 대시보드 배지 알림 ③ "돌아왔습니다" 모달 클릭 또는 교사 "재개 승인"으로 해제. **자동 제출·자동 처벌 없음**. ProctorEvent 로그는 감사용 기록 | "알림 + 화면이탈잠금같은기능?" | 디폴트("알림만") → **L1 자동 잠금 추가**. 3회 이상 누적 시도 누적 감지는 교사 수동 확인 (자동 전이 없음) |
| **U4** | 공개 타이밍 | `teacher_manual` (릴리스 버튼) | (미질문, 디폴트 적용) | 디폴트 유지 |
| **U5** | v1 문항 스코프 | **MCQ + SHORT 2종만**. OX / NUMERIC / ESSAY는 schema-only, UI off, v1.5+ | "MCQ + SHORT (서술형)만" | 디폴트(4종) → **2종으로 축소**. LLM 비용·OCR 리스크·개발 스코프 동시 감소. OX·NUMERIC은 v1.5 파일럿으로 파킹 |

### 6.1 변경 영향 요약

1. **LLM 비용 모델 단순화** — SHORT 문항만 LLM 호출. MCQ는 결정론 매칭(DB 비교). 월 채점 수 × SHORT 비중 × Gemini Flash 단가로 비용 상한 예측 가능.
2. **문항 수 제약** — v1 Board당 MCQ + SHORT 혼합 허용. OX·NUMERIC·ESSAY 문항 생성 UI는 비활성 토글 (schema 존재하되 create API 차단).
3. **Proctor L1 강화** — sketch.md L1(UX 신호) 레이어에 "답안 영역 자동 disable + 재개 모달" 구현 추가. L2(교사 대시보드)는 기존 배지 유지. L3·L4는 계획대로.
4. **Tier gate 토글** — `FeatureFlag.assessmentTierGate = false` (개발·베타), 런칭 시 true 전환. 관리자 환경변수로 제어.

### 6.2 phase4 seed 입력 재요약 (5.의 값 교체)

- session_id: `interview_20260415_223155`
- scope: **MCQ + SHORT** (v1.5에 OX·NUMERIC, v2에 ESSAY 예약)
- infra: D1 공통 Supabase + RLS + Realtime
- LLM: **gemini-flash (SHORT 전용)**, MCQ는 결정론 매칭
- tier: **Pro 전용 (개발·베타 gate off 플래그)**
- release: teacher_manual
- proctor: **알림 + 자동 화면이탈 잠금 (L1 강화)**
- 신규 엔티티 7 + Classroom·AssignmentSlot·Board 확장
- 타임라인: 8~10주 (스코프 축소로 하한 단축 가능)

---

## 7. 사용자 확정 편입 라운드 (2026-04-16 보충)

> 이전 session `interview_20260415_223155`는 ambiguity 0.15에 이미 종결되어 신규 라운드 주입이 불가했다. **새 session `interview_20260415_224854`**를 열어 사용자 확정 U1·U2·U3·U5를 initial_context로 편입하고, Ouroboros가 제기한 추가 파라미터(§7.3·§7.4·§7.5) 3건을 에이전트 자율 답변으로 수렴. 최종 **ambiguity 0.10** 달성 (기존 0.15 대비 개선).
>
> **기존 §1~§6은 보존한다** (히스토리 감사 목적). 본 §7이 phase4 seed 입력의 ground truth.

### 7.1 편입된 사용자 확정 (U1·U2·U3·U5)

| # | 항목 | 최종 확정 | acceptance_criteria 반영 필수 |
|---|---|---|---|
| **U1** | Tier 배치 | Pro 전용 (최종). **개발·베타 기간에는 `FeatureFlag.assessmentTierGate=false`로 전 사용자 공개**, 런칭 시 true 전환으로 Pro gate enforce | **U1 → acceptance_criteria 반영 필수** — 런칭 플래그 스키마, enforce 분기 조건, 관리자 토글 경로 명시 |
| **U2** | 채점 LLM | Gemini 2.5 Flash는 **SHORT 문항 전용**. MCQ는 `payload.correctChoiceIds` ↔ `answer.payload.selectedChoiceIds` **서버 결정론 매칭**(LLM 호출 없음). NUMERIC·OX·ESSAY는 v1 비활성 | **U2 → acceptance_criteria 반영 필수** — MCQ 채점 경로에 LLM 호출 금지 가드, SHORT 전용 Gemini 프로바이더 라우팅, Promptfoo 회귀 대상을 SHORT로만 축소 |
| **U3** | 부정행위 정책 | 알림 + **자동 화면이탈 잠금** 하이브리드. 답안 영역 disable + 교사 배지 + "돌아왔습니다" 모달 또는 교사 "재개 승인"으로 해제. **자동 제출·자동 처벌·자동 상태 전이 없음** | **U3 → acceptance_criteria 반영 필수** — 잠금 상태머신, 해제 경로 2종(student_modal/teacher_approve), Realtime 동기화, 시간 비정지 정책 |
| U4 | 공개 타이밍 | `teacher_manual` (디폴트 유지, 변경 없음) | 기존 §1.3 유지 |
| **U5** | v1 문항 유형 스코프 | **MCQ + SHORT 2종만**. OX·NUMERIC은 v1.5 파킹, ESSAY는 v2 파킹. schema 5종 유지하되 create API는 MCQ·SHORT만 허용 | **U5 → acceptance_criteria 반영 필수** — Zod validation 게이트, UI 드롭다운 2종 제한, v1.5·v2 파킹 리스트에 OX/NUMERIC/ESSAY 등록 |

### 7.2 보충 세션 추가 수렴 항목 (에이전트 자율)

#### 7.2.1 SHORT 문항 채점 데이터 구조 (Q: 교사 모범답안 입력 형태)
sketch.md §2.3 유지: `payload = { modelAnswers: string[], keywords: string[], partialCredit: boolean }` 3필드 복합. 교사 UI 4필드 폼:
1. **모범답안 예시** (필수, 최소 1건) → `modelAnswers[]`
2. **필수 키워드** (선택, 쉼표 구분) → `keywords[]`
3. **부분점수 허용 체크박스** → `partialCredit`
4. **루브릭 자연어** (선택) → 문항별 `AssessmentQuestion.rubric` (템플릿 `rubricText`에 추가 override)

Gemini 프롬프트 구조: `{template.rubricText + question.rubric + modelAnswers + keywords + (inkImageUrl via Vision OR textAnswer)}`. `partialCredit=false`일 때만 이진 처리(전부맞음/전부틀림), 기본은 부분점수. 수치 배점 루브릭(정확성 40%/표현 30%)은 v1 미포함 — 자연어 루브릭이 LLM 해석으로 충분(sketch "교사 학습곡선 최소화" 원칙).

#### 7.2.2 U3 잠금 중 시험 타이머 동작 (Q: 정지 vs 계속 흐름)
**계속 흐름** 채택.
- 근거: (1) 사용자 U3 원문은 시간 보정 언급 없음. (2) 시간 정지 도입은 **악용 인센티브**(의도적 탭 전환으로 사고 시간 확보). (3) sketch §6.3 서버 cron 자동 제출 기준이 `startedAt + durationMin` 단일 공식이라 정지·회복 도입 시 §3.2·§6.3 재설계 수반. (4) 교사 "재개 승인" 경로가 이미 존재하므로 피해 판단 시 교사 개별 구제(`endAt` 연장 v1.5 검토 또는 finalScore 보정) 가능.
- 구현: `endAt = startedAt + durationMin` 고정. `isLocked=true` 상태에서도 클라이언트 카운트다운 계속. UI는 dim + **"잠금 중 — 시간은 계속 흐릅니다"** 고지 문구. 감사: `ProctorEvent.durationMs` 필드가 잠금 기간 보존.

#### 7.2.3 U3 `isLocked` 상태 저장 위치 (Q: 클라이언트 state vs Supabase 영속)
**Supabase 영속화** 채택. 근거: 클라이언트 state만이면 새로고침 한 번으로 우회 → 잠금 실효성 제로, UX 연극. 교사 "재개 승인" Realtime broadcast도 row 갱신 전제이므로 영속 저장이 자연스러움.

**스키마 확장** (seed에 반드시 포함):
```prisma
model AssessmentSubmission {
  // ... 기존 필드 ...
  isLocked      Boolean @default(false)
  lockedReason  String? // "visibility_hidden" | "fullscreen_exit" | "focus_lost" | "teacher_manual" | null
}
```

**동기화 흐름**:
1. L1 이벤트 발생 → 클라이언트 `POST /api/assessment/[submissionId]/lock` 즉시 호출(debounce 불가) → 서버가 `isLocked=true, lockedReason` 갱신 + ProctorEvent insert.
2. 학생 "돌아왔습니다" 모달 클릭 → `POST /api/assessment/[submissionId]/unlock?by=student` → `isLocked=false, lockedReason=null`.
3. 교사 "재개 승인" 클릭 → `POST /api/assessment/[submissionId]/unlock?by=teacher&teacherId=X` → 동일 갱신 + ProctorEvent(type=teacher_resume) 기록(신규 enum 값 추가).
4. 학생 페이지 mount 시 submission row 로드 → `isLocked=true`면 자동으로 잠금 UI(모달 표시).
5. Realtime 구독: 학생 탭이 자기 submission row의 `isLocked` 필드 변화 수신 → 교사 재개 승인 즉시 UI 해제.

**네트워크 단절 대응**: lock API 실패 시 클라이언트 로컬 `isLocked=true` 유지(안전 측). 재접속 시 서버 상태가 ground truth.

**RLS 보강**: unlock API는 teacher(Classroom owner) 또는 본인 student(`submissionId`의 studentId == auth.student_id())만 호출 가능. 다른 학생 unlock 차단.

**ProctorEventType enum 확장** (sketch §2.7 기준):
- 신규 값 추가: `teacher_resume` (교사가 재개 승인 시 기록)

### 7.3 phase4 seed 입력 최종 재요약 (§6.2 → §7.3 덮어쓰기)

- **session_id**: `interview_20260415_224854` (신규, 보충 세션)
- **이전 session**: `interview_20260415_223155` (감사 이력, ambiguity 0.15 종결)
- **scope**: MCQ + SHORT (OX·NUMERIC은 v1.5 파킹, ESSAY는 v2 파킹)
- **infra**: D1 공통 Supabase + RLS + Realtime
- **LLM**: gemini-flash (SHORT 전용), MCQ는 서버 결정론 매칭(LLM 호출 금지 가드)
- **tier**: Pro 전용 + `FeatureFlag.assessmentTierGate` 런칭 플래그(개발·베타 false)
- **release**: teacher_manual
- **proctor**: 알림 + 자동 화면이탈 잠금(L1 강화). `AssessmentSubmission.isLocked/lockedReason` 영속, 해제 2경로(student_modal/teacher_approve), 시간 계속 흐름
- **스키마 증분** (sketch §2 기준): `AssessmentSubmission.isLocked Boolean @default(false)` + `AssessmentSubmission.lockedReason String?` + `ProctorEventType.teacher_resume` 추가
- **Question create API**: Zod validation으로 `kind IN (MCQ, SHORT)` gate
- **FeatureFlag 엔티티**: 신규(또는 env var + Supabase config row, seed 단계에서 택일)
- **신규 API 엔드포인트**: `POST /api/assessment/[submissionId]/lock`, `POST /api/assessment/[submissionId]/unlock?by={student|teacher}`
- **타임라인**: 8~10주 (스코프 축소로 하한 단축 가능, 잠금 API 0.5주 추가)
- **ambiguity**: 0.10 (≤ 0.2 게이트 통과, 이전 0.15 대비 개선)

### 7.4 인터뷰 메타 (보충)

- 신규 session 라운드: **3** (SHORT payload 구조 → 타이머 정지 → isLocked 저장 위치)
- 에이전트 자율 답변: 3건 모두 sketch·decisions §1~§6 근거로 즉결
- AskUserQuestion 미사용 (이미 확정 완료, 제약 준수)
- 다음 단계: phase4 seed 재생성 (seed_9f8c6764324e는 대체됨, session_id=`interview_20260415_224854` 기반으로 재호출)

