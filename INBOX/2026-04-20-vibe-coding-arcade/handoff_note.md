# Handoff Note — 학급 Steam / Vibe Coding Arcade (Seed 13)

> **인수인계 대상**: padlet 피처 파이프라인 (Aura-board)
> **source seed**: `seed_vibe_arcade_v1_2026_04_20` (ambiguity 0.13, MCP_UNAVAILABLE 폴백)
> **source task**: `ideation/tasks/2026-04-20-vibe-coding-arcade/`
> **작성일**: 2026-04-20
> **ideation phase**: 6 (handoff-writer)
> **다음 단계**: ideation phase7 dispatcher → padlet INBOX 배송 → padlet phase0 analyst

---

## [최우선 주의] 사용자 확정 대기 4건 — phase0 분석 착수 전 확인 필수

본 시드는 Ouroboros interview MCP 미가용으로 폴백 모드 운영되었고, 4건은 **sketch 기본값으로 고정하되 사용자 런칭 전 확정 대기** 상태다. padlet phase0 analyst는 request.json 수용 직후 사용자에게 **체크리스트 1회 확인 루프**를 돌려야 한다.

| # | 항목 | 기본값 (고정) | 대체안 (기각 조건부) | 영향 필드 | 확정 시점 |
|---|------|-------------|------------------|---------|---------|
| **U-1** | 모더레이션 정책 초기값 | `teacher_approval_required` | `auto_publish` (R-2 위험), `hybrid_trusted` (v1.5 신뢰등급 필요) | `VibeArcadeConfig.moderationPolicy` | **padlet phase0 수용 직후** |
| **U-2** | 리뷰 작성자 표시 | `named` (실명·번호) | `anonymous` (악성 유인), `hidden_to_peer` (v1.5) | `VibeArcadeConfig.reviewAuthorDisplay` | UX 와이어프레임 최종화 전 |
| **U-3** | 리뷰 평가 시스템 | `stars_1_5` | `thumbs` (정보량 축소), `emoji_5` (v2 A/B) | `VibeArcadeConfig.reviewRatingSystem` | UX 와이어프레임 최종화 전 |
| **U-4** | 학급 간 공유 범위 | `false` (반 내부만) | 동일 교사 다반(v1.5), 학교 단위(v2+ 학교 플랜) | `VibeArcadeConfig.crossClassroomVisible` | Seed 2 학교 플랜 v2 설계 전 |

**4건 공통 특성**: 모두 `VibeArcadeConfig` 필드로 이미 구조화되어 있어 기본값 변경이 **스키마 변경이 아니다** — 런칭 후에도 교사 대시보드 탭4에서 학급 단위 조정 가능. 따라서 phase0 분석 블로커가 되어선 안 되며, 기본값으로 일단 진행하고 운영 단계에서 토글 가능 구조로 구현할 것.

---

## 배경

Aura-board 교사 계정의 상시 잉여 Claude Sonnet API 쿼터를 **"학생이 Sonnet과 바이브 코딩으로 브라우저 즉시 실행 가능한 게임·퀴즈·미니앱을 만들고 반 친구들이 플레이·평가하는 학급 Steam 공간"**으로 전환하는 신규 레이아웃이다. `Board.layout="vibe-arcade"` enum 확장 1건 + 도메인 엔티티 6종 + Seed 12 LLM 추상화에 `anthropic-sonnet.ts` provider 1개 추가로 구성되며, 쿼터 낭비 해소 · AI 리터러시 실습 · 학급 내 생산자-소비자 상호작용 루프를 동시 달성한다.

본 시드는 `ideas-parking-lot.md`의 "게임 제작 보드 V1 MakeCode Arcade 임베드안"을 **슈퍼시드**하며, phase7 dispatcher가 parking → archive 물리 이동을 수행한다.

---

## 참조 문서 필수 독해 순서

> padlet phase0 analyst는 **이 순서대로** 읽어야 의도·제약·결정 근거가 체인으로 연결된다.

1. **`tasks/2026-04-20-vibe-coding-arcade/phase0/request.json`** — 동기 · 기대 성과 · 9건 known_constraints 원본 (잉여 쿼터 소진이 설계 전제)
2. **`tasks/2026-04-20-vibe-coding-arcade/phase1/exploration.md`** — 경쟁·레퍼런스 비교 (Scratch·itch.io·Steam·Glitch·MakeCode Arcade·Claude Artifacts) + UX 패턴 · 쿼터 원단가 (IN 3K + OUT 12K ≈ 15K/세션 × 3세션 = 45K/학생·일) · 보안 스택 CSP `frame-src 'none'` 선결 제약
3. **`tasks/2026-04-20-vibe-coding-arcade/phase2/sketch.md`** — 엔티티 6종 스키마 초안 · 3역할 플로우 · D-1~D-8 고정 전제 (재논의 금지) · R-1~R-11 리스크 매트릭스
4. **`tasks/2026-04-20-vibe-coding-arcade/phase3/decisions.md`** — D-PHASE3-01~11 결정 11건 · §2 새로 드러난 분기 F-1~F-7 파킹 사유 · §3 사용자 확정 대기 U-1~U-4 체크리스트 · §4 ambiguity 0.13 산출 근거
5. **`tasks/2026-04-20-vibe-coding-arcade/phase4/seed.yaml`** — goal · constraints (9 known + 4 사용자 확정 대기 + 7 F-* 파킹 + 8 D-* 전제) · acceptance_criteria (functional·non_functional·ux·governance 4 축) · ontology_schema · related_seeds · future_user_confirmation
6. **`plans/vibe-arcade-roadmap.md`** (phase5 integrator 신규 생성) — §1~§11 전체. 특히 §7 작업 분할 VA-1~VA-12 (예상 30~35일) + §2 성능 예산 + §3 쿼터 회계 + §4 모더레이션 SOP
7. **`plans/tablet-performance-roadmap.md` §2·§2a·§2c** — 갤럭시 탭 S6 Lite 예산 + `§2c-vibe-arcade-레이아웃-성능-예산-seed-13` (카탈로그 iframe 0, 모달 iframe 1, LRU 3, TTI<3s, 번들<500KB gzip, phase9 QA 게이트 12항목)
8. **`plans/seeds-index.md#seed_vibe_arcade_v1_2026_04_20`** — 의존성 그래프 (Seed 2·5·7·11·12 교차 참조)
9. **`plans/phase0-requests.md`** — VA-1 + VA-2~VA-12 통합 2개 블록 (acceptance 30건 포함)
10. **padlet 자체**: `padlet/prompts/feature/phase0_analyst.md` (포맷 참조, 읽기 전용) + `padlet/prompts/feature/_index.md` (피처 파이프라인 순서 준수)

---

## 기준 단말 · 핵심 제약 (재설정 금지)

- **디바이스 기준**: 갤럭시 탭 S6 Lite (Chrome). 번들 < 500KB gzip · TTI < 3s · 카탈로그 iframe 0개 · 모달 iframe 1개만 + about:blank 언마운트 · LRU 상한 3 (Seed 5 승계)
- **LLM 모델**: **Claude Sonnet 전용.** Haiku·Opus 다운그레이드·교체 금지 — 잉여 쿼터 소진이 설계 전제이므로 위반 시 동기 붕괴
- **실행 환경**: Aura-board 생태계 내부. 외부 별도 앱·별도 도메인 신설 금지. **GPL 격리·padlet 읽기 전용** 원칙은 ideation 하네스 측 규칙 (구현 시 Aura-board 라이선스 준수만)
- **운영 단위**: 학급 (교사 1인 관찰 범위). 전교·전사 확장은 v2+
- **Tier 게이팅**: Free 접근 불가, **Pro 전용** + `FeatureFlag.vibeArcadeGate` 런칭 플래그. 학교 플랜은 v2+
- **결과물 형식**: 단일 HTML + inline JS/CSS + **외부 CDN 화이트리스트 3개** (jsdelivr·cdnjs·unpkg, HTTP-only, SRI 필수). 빌드 단계·외부 호스팅·WASM 업로드 금지
- **샌드박스 4중 방어**: cross-origin 서브도메인(`sandbox.aura-board.app`) + `<iframe sandbox="allow-scripts">` (allow-same-origin 금지) + CSP 응답 헤더 `sandbox` · `frame-src 'none'` · `default-src 'self' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com` + postMessage origin 화이트리스트
- **쿼터 3단 배분**: 교사 월 쿼터 → 잉여분 → 학급 풀 150만/일 + 학생 개인 45K/일, 자정 리셋 KST, 세션 타임아웃(활성 30분·입력 대기 5분), **소진 시 "내일 다시" 모달 (Haiku 다운그레이드 금지)**
- **모더레이션 다층 방어**: (a) Anthropic input classifier (b) 서버 프롬프트 필터 (금칙어·개인정보 regex·금지 주제) (c) 교사 승인 게이트 (`pending_review` 기본) (d) 사후 학생 신고 → flagged 전환
- **감사 보존**: 7일 미활성 자동 익명화 (`studentId→null`, `classroomId` 유지) · Free 120일 하드 삭제 · Pro 365일 하드 삭제 (Seed 12 관례 승계)

---

## 이번 작업 (seed.goal 요약)

`Board.layout="vibe-arcade"` 신규 레이아웃을 도입하고, 도메인 엔티티 6종(`VibeArcadeConfig`·`VibeProject`·`VibeSession`·`VibeReview`·`VibePlaySession`·`VibeQuotaLedger`)을 추가한다. Seed 12 LLM 프로바이더 추상화에 `src/lib/llm/providers/anthropic-sonnet.ts`를 신설하여 Anthropic SDK `messages.create(stream=true)`를 래핑하고, 서버 프록시를 통해 학생 세션을 중개한다. 3역할(제작자·소비자·모더레이터) 플로우 + 교사 모더레이션 대시보드 4탭 + 샌드박스 4중 방어 + 쿼터 3단 배분 + 고정 태그 5종 + 리뷰 시스템 + 학급 간 공유 기본 false로 구현한다.

**달성 지표**: 한 학급 기준 주당 학생 1인당 바이브 코딩 세션 ≥ 1회 · 타인 결과물 플레이·리뷰 ≥ 3회 · Sonnet 잉여 쿼터의 60% 이상이 학생 세션으로 소비.

---

## 수용 기준 체크리스트 (seed.acceptance_criteria 전부)

### Functional (기능)

- [ ] `VibeArcadeConfig` 엔티티 CRUD API (`boardId` PK · `moderationPolicy` · `perStudentDailyTokenCap=45000` · `classroomDailyTokenPool=1500000` · `crossClassroomVisible=false` · `reviewAuthorDisplay=named` · `reviewRatingSystem=stars_1_5` · `allowRemix=false`) 생성·조회·수정
- [ ] `VibeProject` 엔티티 CRUD (`htmlContent` · `thumbnailUrl` · `tags` · `moderationStatus` · `approvedAt/ById` · `rejectedAt/ById` · `playCount` · `uniquePlayCount` · `reviewCount` · `ratingAvg` · `version`) + 교사 승인/반려 API
- [ ] `VibeSession` 엔티티 CRUD (`messages` Json · `tokensIn` · `tokensOut` · `status` · `refusalCount` · `startedAt` · `endedAt`) 생성·스트리밍 대화·종료 API
- [ ] `VibeReview` 엔티티 CRUD (`projectId+reviewerStudentId` unique · `rating` · `comment` · `moderationStatus` · `flagCount`) 생성·조회·신고 API
- [ ] `VibePlaySession` 엔티티 (`projectId` · `studentId` · `startedAt` · `endedAt` · `completed` · `reportedScore`) postMessage 수신 원장 기록 API
- [ ] `VibeQuotaLedger` 엔티티 (`classroomId` · `studentId` nullable · `date` · `tokensIn/Out` · `sessionsCount`, `(classroomId, studentId, date)` unique) 일별 rollup + 교사 대시보드 집계 쿼리
- [ ] `Board.layout` enum에 `"vibe-arcade"` 값 추가 (기존 11개 값 유지, 신규 BoardType 금지)
- [ ] `src/lib/llm/providers/anthropic-sonnet.ts` 신설 — Anthropic SDK `messages.create(stream=true)` 래핑 · 교사 계정 API Key 서버 프록시 · 입력 사전 필터 hook · 출력 ```html 블록 파서 + `<iframe>·<object>·<embed>` 블랙리스트 태그 스캔 · refusal 수신 시 `VibeSession.refusalCount` 증분
- [ ] 학생(제작자) 플로우 — 쿼터 체크 → `POST /api/vibe/sessions` → Sonnet 스트리밍 수신 → 미리보기 iframe srcdoc 갱신 → `POST /api/vibe/projects` (title·description·tags) → 서버 Playwright headless 160×120 WebP 썸네일 생성 → `moderationStatus="pending_review"` 기본 게시
- [ ] 학생(소비자) 플로우 — 카탈로그 그리드 (정렬: 신작/인기/친구 추천/평가 미작성) → 카드 탭 전체화면 모달 → cross-origin 서브도메인 serving HTML iframe 마운트 (playToken JWT 1시간) → VibePlaySession 생성 → 플레이 완료 postMessage 수신 → 리뷰 작성 → VibeReview 생성 + VibeProject.reviewCount/ratingAvg 비정규화 업데이트 → 신고 버튼
- [ ] 교사 모더레이션 대시보드 4탭 — [1] 승인 큐 (pending_review/flagged) + 키보드 단축키 A=승인/R=반려 [2] 쿼터 현황 7일 집계 + 학생 일일 한도 조정 슬라이더 [3] 프롬프트 로그 감사 뷰 (금칙어 매치 필터 + CSV 다운로드) [4] 설정 (VibeArcadeConfig 6필드 + FeatureFlag.vibeArcadeGate 보드 레벨 on/off) + 긴급 행동 '학급 아케이드 일시 정지' (`classroomDailyTokenPool=0`)
- [ ] Sonnet 쿼터 3단 배분 — 교사 월 쿼터 → 잉여분 → 학급 풀 일일 150만 + 학생 개인 일일 45K, 자정 리셋 KST, 세션 시작 전 양쪽 체크, 소진 시 '내일 다시' 모달 (다운그레이드 금지)
- [ ] 샌드박스 실행 환경 — `https://sandbox.aura-board.app/vibe/{projectId}?pt=<playToken>` cross-origin 서빙 + `<iframe sandbox="allow-scripts">` + CSP 응답 헤더 `sandbox`·`frame-src 'none'`·`default-src 'self' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com` 화이트리스트 + 게시 전 서버 파서 `<iframe>·<object>·<embed>` 블랙리스트 스캔
- [ ] 태그 시스템 v1 — 고정 태그 5종 `["게임", "퀴즈", "시뮬", "아트", "기타"]`, 학생이 하나 선택 (복수 선택·자유 태그 v2 파킹)

### Non-functional (비기능)

- [ ] 아케이드 카탈로그 TTI < 3s (30 카드 기준, 갤럭시 탭 S6 Lite Chrome 실측)
- [ ] 첫 뷰포트 JS+CSS 번들 < 500KB gzip (Monaco 등 무거운 에디터 금지)
- [ ] iframe LRU 상한 3개 (Seed 5 승계), 카탈로그 뷰 iframe 0 강제, 모달 iframe 1개만 마운트 + 모달 닫힘 시 즉시 언마운트 + `src="about:blank"`
- [ ] 썸네일 160×120 WebP + `loading="lazy"` + IntersectionObserver + 서버 Playwright headless 생성 (클라 생성 금지)
- [ ] Sonnet 스트리밍 — SSE/WebSocket 증분 텍스트 append만 (React state 누적 금지), 토큰당 p95 지연 < 200ms
- [ ] 쿼터 — 학생 일일 45K 토큰 / 학급 일일 150만 토큰 (교사 대시보드 슬라이더로 조정 가능)
- [ ] 대화 로그 보존 — 7일 미활성 자동 익명화 (studentId→null, classroomId 유지) · Free tier 하드 삭제 after 120일 · Pro tier 하드 삭제 after 365일 (cron daily 00:10 KST 익명화 + weekly 삭제)
- [ ] 학급 30명 동시 제작 세션 — API 레이트 limit 학급 200/h, WebSocket 채널 `board:${id}:vibe-arcade` 단일, 승인 배지 전파 < 500ms
- [ ] 플레이 iframe 60fps (requestAnimationFrame), 메모리 < 100MB/iframe, 비활성 5분 자동 언마운트
- [ ] 1시간 사용 후 총 메모리 < 500MB, 모달 닫힘 후 DOM 잔존 `iframe[data-vibe-sandbox]` 0개
- [ ] sandbox iframe 내 `document.cookie` 접근 → empty string (쿠키 탈취 불가 검증 테스트)
- [ ] postMessage origin 검증 누락 시 메시지 무시 (단위 테스트)
- [ ] Aura Sonnet API Key는 env 보관 금지 — CanvaConnectAccount 스타일 DB 암호화 + 교사별 스코프 + 일일 비정상 소비 Slack 경보 (R-8 완화)

### UX

- [ ] 모더레이션 정책 기본값 `teacher_approval_required` + 교사 대시보드 탭4 토글로 런타임 변경 가능 (`VibeArcadeConfig.moderationPolicy`) **[U-1]**
- [ ] 리뷰 작성자 표시 기본값 `named` (실명·번호) — 교사 설정으로 `anonymous`·`hidden_to_peer` 전환 가능. 교사는 항상 원ID 열람 **[U-2]**
- [ ] 리뷰 평가 기본값 `stars_1_5` — 교사 설정으로 `thumbs`(이진) 또는 `emoji_5`(v2) 전환 가능. 카탈로그 정렬 '별점 평균' 기준 **[U-3]**
- [ ] 신고 3건 자동 `hidden_by_teacher` 전환 (VibeReview.flagCount + R-10 완화) + 욕설 regex 자동 차단 + 교사 대시보드 리뷰 탭 최종 검토
- [ ] 학생 일일 한도 소진 시 '오늘치 소진, 내일 다시 시도' 모달 (Haiku 다운그레이드 금지). 학급 풀 소진 시 교사 알림 + 신규 세션 차단 (기존 세션 종료까지 허용)
- [ ] 교사 대시보드 쿼터 탭 — 학급 풀 잔량/당일 소진 가로 막대 + 학생별 사용량 정렬 리스트 + 학생 일일 한도 조정 슬라이더
- [ ] 카탈로그 탭 5종: `신작` · `인기` · `친구 추천` · `🎯 평가 미작성` · 태그 필터(고정 5종). itch.io 'Top Rated' UX 복제
- [ ] 학생 작품 반려 시 `moderationNote` 표시 + 수정·재제출 플로우 (version+=1)

### Governance (거버넌스·리스크 완화)

- [ ] R-1 쿠키·토큰 탈취 방어 완료 — cross-origin 서브도메인 분리 + iframe sandbox(allow-scripts only) + CSP sandbox 이중 방어 + postMessage origin 화이트리스트 강제 (D-3)
- [ ] R-2 부적절·폭력·성인 콘텐츠 다층 방어 — (a) Anthropic input classifier (b) 서버 프롬프트 필터 — 금칙어·개인정보 regex·금지 주제 화이트리스트 (c) 교사 승인 게이트(pending_review 기본) (d) 사후 학생 신고 → flagged 전환
- [ ] R-3 쿼터 독식 방지 — `perStudentDailyTokenCap` + `classroomDailyTokenPool` + 세션 타임아웃(활성 30분·입력 대기 5분) + 교사 대시보드 실시간 모니터
- [ ] R-4 저작권 — v1은 저작 가이드 팝업 1회 노출 + 프롬프트 사전 안내 '특정 상용 게임 이름 금지'. 기술적 감지(simhash · Scratch DB 대조)는 v1.5+ 파킹
- [ ] R-5 개인정보 자동 스캔 — gongmun-assistant `privacy.py` 패턴 재활용 (전화번호·주민번호·한글 성명 5자 이내 regex) + 프롬프트 사전 스캔 + 게시 시점 HTML 추가 스캔 + 교사 승인 게이트가 최종 방어선 + 이미지 첨부 기능 자체 없음
- [ ] R-7 교사 부담 완화 — 자동 1차 필터(Anthropic refusal + 서버 금칙어 → auto reject) + 신고받은 건 상단 정렬 + 키보드 단축키 A/R. ML 자동 분류는 v1.5+ 파킹
- [ ] R-8 API 키 유출 방지 — env 보관 금지 + DB 암호화 + 서버 프록시 전용(클라 직접 호출 금지) + 학생별 레이트 limit + 일일 비정상 소비 Slack 경보
- [ ] R-9 학생 데이터 프라이버시 — 7일 미활성 자동 익명화 + Free 1학기/Pro 학년 보존 + 자동 하드 삭제 cron (Seed 12 관례 승계)
- [ ] R-10 리뷰 악성 사용 — 신고 3건 auto-hidden + 욕설 regex 차단 + `reviewAuthorDisplay=named` 기본(실명 책임) + 교사 대시보드 리뷰 탭
- [ ] R-11 외부 도메인 로드 차단 — CSP `frame-src 'none'` 강제 + 서버 파서 `<iframe>·<object>·<embed>` 블랙리스트 + 외부 CDN 화이트리스트(jsdelivr·cdnjs·unpkg, HTTP-only, SRI 필수)
- [ ] 교사 대시보드 프롬프트 로그 감사 뷰 — `VibeSession.messages` 금칙어 매치 필터링 + 학생별 세션 그룹핑 + 대화 전체 CSV 다운로드 (교육청 감사 요청 대응)

---

## 주의사항 (padlet 피처 파이프라인 준수)

1. **padlet `prompts/feature/` 파이프라인 그대로 준수** — phase0 analyst → phase1 architect → ... 순서 변경·스킵 금지.
2. **임의 결정 금지** — 본 노트와 seed.yaml에 기록되지 않은 설계 결정은 새로 내리지 말고, 대신 padlet phase0 analyst 단계에서 **사용자 확정 대기 U-1~U-4를 먼저 묻고**, 그 외 불명 사항은 ideation 팀에 재질의 (task_id `2026-04-20-vibe-coding-arcade`).
3. **고정 전제 D-1~D-8 재논의 금지** — Aura-board 내부 자체 구현 · 단일 HTML 아티팩트 · 샌드박스 4중 방어 · `Board.layout=vibe-arcade` enum 확장 · 신규 유저/조직 엔티티 0 · 서버 프록시 Sonnet 호출 · `anthropic-sonnet.ts` provider 1개 · Pro tier + FeatureFlag 게이팅.
4. **파킹 분기 F-1~F-7 편입 금지** — v1 스코프 밖 (신뢰 등급 · 좋아요 화폐 · 학부모 열람 · Remix · Best Of PDF · Pyodide · 스쿨마스터).
5. **LLM 모델 Sonnet 고정** — 비용 절약 목적으로도 Haiku/Opus 다운그레이드 금지. 쿼터 소진 시 "내일 다시" 모달만.
6. **성능 예산 강제** — `tablet-performance-roadmap.md §2c` 12항목은 phase9 QA 게이트 통과 조건. 카탈로그 iframe 0 · 모달 iframe 1 · 쿠키 탈취 불가 테스트는 단위/통합 테스트로 증명.
7. **보안 이중 방어 필수** — cross-origin 서브도메인 `sandbox.aura-board.app`은 단순 경로 분리가 아니라 **실제 다른 오리진**이어야 함 (Vercel 경우 별도 도메인 설정 / 자체 배포 경우 리버스 프록시 + DNS 분리). 경로 분리(`/sandbox/...`)만으로는 cross-origin 격리 불충분 — 쿠키·localStorage 접근 차단 안 됨.
8. **서버 파서의 블랙리스트 스캔**: `<iframe>·<object>·<embed>` 태그뿐 아니라 `javascript:` 스킴 URL · `data:` HTML 문서 · inline event handler 과다 · 외부 CDN 화이트리스트 외 URL도 reject. 서버 단에서 HTML 파싱 (정규식 XSS 우회 가능하므로 `parse5` 또는 `jsdom` 사용).
9. **padlet 폴더 쓰기는 dispatcher만 (INBOX 한정)** — handoff-writer 에이전트 본인은 padlet 폴더 쓰기 금지. 본 노트 + request.json은 ideation `tasks/.../phase6/`에 저장, 물리 배송은 phase7 dispatcher가 수행.
10. **재질의 채널**: 사용자 확정 U-1~U-4 외에 설계 불명 항목은 ideation `tasks/2026-04-20-vibe-coding-arcade/` 디렉토리로 질문 이슈 열기. seed.yaml을 수정하지 말고 **refinement 파이프라인**으로 재진입.

---

## 검증 게이트 사전 체크 (ideation phase6)

- [x] `padlet_phase0_request.json` 존재 (본 디렉토리)
- [x] `handoff_note.md` 존재 (본 파일)
- [x] user_story "사용자(학생)로서 … 할 수 있다" 한 문장 형식 충족
- [x] success_metric 측정 가능 수치 (주 1회 세션 + 주 3회 플레이·리뷰 + 쿼터 60% 소비)
- [x] affected_surfaces 24개 (prisma + feature root + 9개 컴포넌트·lib + LLM provider + layout registry + 라우트 2개 + middleware + feature flag + cron 3개)
- [x] context_refs 14개 (phase0~6 + plans 5개 + ideas-parking-lot)
- [x] acceptance_criteria 전 항목 체크리스트화 (functional 14 · non_functional 13 · ux 8 · governance 11)
- [x] 사용자 확정 대기 U-1~U-4 상단 배치 (눈에 띄는 경고 테이블)
- [x] 참조 문서 10항목 (필수 순서)

---

> **다음 단계**: phase7 dispatcher가 본 `handoff_note.md` + `padlet_phase0_request.json` 2개 파일을 `../../../../padlet/INBOX/` (destinations/_registry.md 라우팅 규칙 따라)로 배송하고, `ideas-parking-lot.md`의 "게임 제작 보드 V1 MakeCode Arcade 임베드안"을 `destinations/archive/`로 이동 마킹한다.
