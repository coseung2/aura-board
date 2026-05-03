# MANIFEST — 학급 Steam / Vibe Coding Arcade v1 (padlet 수신)

## 배송 메타

- **Topic**: Aura-board 내부 학급 Steam — 학생이 Claude Sonnet과 바이브 코딩으로 제작한 게임·퀴즈·미니앱을 반 친구들에게 게시·플레이·리뷰받는 공간 신설. `Board.layout="vibe-arcade"` 신규 레이아웃 1개 + 도메인 엔티티 6종(VibeArcadeConfig·VibeProject·VibeSession·VibeReview·VibePlaySession·VibeQuotaLedger) + Seed 12 LLM 프로바이더 추상화에 `anthropic-sonnet.ts` provider 1개 추가.
- **Motivation**: Aura-board 교사 계정의 상시 잉여 Claude Sonnet API 쿼터를 학생용 바이브 코딩 체험 예산으로 전환. (1) 쿼터 낭비 해소 (2) 학생의 AI 리터러시 실습 (3) 생산자(제작 학생)–소비자(플레이 학생) 순환 루프를 한 공간에서 자연 형성. 기존 MakeCode Arcade 임베드안(블록 코딩)은 LLM 쿼터 소진 목적을 달성하지 못하므로 본 시드가 슈퍼시드.
- **Scope**: `full_exploration`
- **Destination**: padlet INBOX (primary — Aura-board 내부 레이아웃·엔티티·LLM provider·서버 프록시·cross-origin 샌드박스·교사 모더레이션 대시보드 전 영역 padlet이 실구현 소유)
- **Routing reason**: `destinations/_registry.md`의 padlet 트리거 "Aura-board 교실 학습 플랫폼" 및 "Board.layout enum 확장" 조건에 명확 매칭. Aura 웹앱 sibling 배송 불필요 — 본 피처는 학생·교사 모두 보드 앱 내부에서 완결되며 부모 뷰어 연동(F-3)은 phase5 integrate에서 parent-viewer-roadmap §5에 예고 노트만 추가하고 실제 학부모 UI 구현은 parent-viewer 후속 시드 스코프.
- **Seed ID**: `seed_vibe_arcade_v1_2026_04_20` (ambiguity 0.13, ≤ 0.2 게이트 통과)
- **Parent seed**: — (신규 Seed 13)
- **Supersedes**: `ideas-parking-lot.md#게임-제작-보드-마인크래프트-느낌` — V1 MakeCode Arcade 임베드안을 본 시드가 Sonnet 바이브 코딩 경로로 재정의하며 슈퍼시드. phase5 integrator가 `ideas-parking-lot.md` 해당 섹션 상단에 슈퍼시드 배너 추가 완료. phase7 dispatcher 본 배송 직후 ideation 측 `destinations/archive/` 이동 마킹은 별도 후속(본 INBOX 배송 스코프 외).
- **Delivered at**: 2026-04-20T00:00:00+09:00 (KST)
- **Pipeline**: ideation → padlet feature pipeline (padlet/prompts/feature/_index.md phase0 analyst 진입)
- **MCP 상태 주의**: Ouroboros interview MCP 미가용 — 폴백 모드 운영. 결정 근거는 phase2 sketch 기본값 + phase0 동기 + phase1 탐색 + tablet-performance §2·§2a 교차 준수. phase3 decisions §3 사용자 확정 대기 4건(U-1~U-4)은 padlet phase0 analyst가 request.json 수용 직후 반드시 1회 확인 루프 필요.

## 번들 구성

| 파일 | 역할 |
|---|---|
| `MANIFEST.md` | 본 파일 (배송 메타) |
| `request.json` | padlet feature phase0 request (소비 진입점, phase6 padlet_phase0_request.json 원본) |
| `handoff_note.md` | 에이전트 프롬프트 (배경·고정 전제·acceptance_criteria 46건·U-1~U-4 체크리스트) |
| `seed.yaml` | 시드 원본 (Source of Truth, ambiguity 0.13) |
| `decisions.md` | phase3 Ouroboros 인터뷰 결정 이력 (D-PHASE3-01~11 + F-1~F-7 파킹 + U-1~U-4 사용자 확정 대기) |
| `context_links.md` | ideation 내 관련 문서 상대 경로 모음 |

## 소비 가이드

1. `handoff_note.md` → `[최우선 주의] 사용자 확정 대기 4건` 섹션 먼저 읽고 padlet phase0 analyst 사용자 확인 루프 준비.
2. `handoff_note.md` 의 `참조 문서 필수 독해 순서` 10항목 순차 소비 (phase0 → phase1 → phase2 → phase3 → phase4 → phase5 → tablet-performance §2c → seeds-index Seed 13 → phase0-requests.md → padlet/prompts/feature/ 지침).
3. `request.json` → padlet feature pipeline phase0 analyst 소비 진입점. `affected_surfaces` 24개, `context_refs` 14개, `blocking_on` VA-1 + Seed 11·12 의존.
4. 구현 중 결정 흔들림 시 `seed.yaml`의 `constraints` 섹션 — D-1~D-8 고정 전제 + 9 known_constraints + F-1~F-7 파킹 편입 금지 + U-1~U-4 기본값 고정 준수. LLM 모델 Sonnet 고정·Haiku 다운그레이드 금지·외부 플랫폼 임베드 금지·신규 BoardType 금지·Pro 전용 게이팅·단일 HTML 아티팩트 원칙 위반 즉시 중단.
5. 본 피처는 Aura-board 내부 완결 — sibling INBOX 배송 없음. 학부모 열람은 parent-viewer 후속 시드 스코프.

## 고정 전제 재확인 체크리스트 (D-1~D-8, 재논의 금지)

- [ ] D-1 Aura-board 내부 자체 구현 (외부 플랫폼 임베드 전면 기각)
- [ ] D-2 Claude Artifacts 패턴 — 학생 결과물 = 단일 HTML 문자열 1개
- [ ] D-3 샌드박스 격리 4중 방어 (cross-origin 서브도메인 + iframe sandbox allow-scripts only + CSP sandbox/frame-src none/CDN 화이트리스트 + postMessage origin 화이트리스트)
- [ ] D-4 Board.layout=`vibe-arcade` enum 확장 (신규 BoardType 금지, Seed 3·6·11·12 관례 승계)
- [ ] D-5 Classroom·Student·User·BoardMember·Section 재사용 (신규 유저·조직 엔티티 0)
- [ ] D-6 Claude Sonnet API 호출 주체 = Aura 서버 (교사 계정 API Key 서버 DB 암호화 보관, 학생 세션은 서버 프록시)
- [ ] D-7 Seed 12 LLM 프로바이더 추상화에 `anthropic-sonnet.ts` provider 1개 추가
- [ ] D-8 Tier 게이팅 — Pro 전용 + `FeatureFlag.vibeArcadeGate` 런칭 플래그

## 쿼터·성능·보안 핵심 규약

- **쿼터 3단 배분**: 교사 월 쿼터 → 잉여분 → 학급 풀 150만/일 + 학생 개인 45K/일, 자정 KST 리셋, 세션 타임아웃(활성 30분·입력 대기 5분), 소진 시 "내일 다시" 모달 (Haiku 다운그레이드 절대 금지)
- **샌드박스**: `https://sandbox.aura-board.app/vibe/{projectId}?pt=<playToken>` cross-origin 서빙 + `<iframe sandbox="allow-scripts">` (allow-same-origin 금지) + CSP 응답 헤더 `sandbox`·`frame-src 'none'`·`default-src 'self' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com`
- **서버 HTML 파서 블랙리스트**: `<iframe>·<object>·<embed>`·`javascript:` 스킴·`data:` HTML 문서·과다 inline event handler·화이트리스트 외 외부 URL 모두 reject. `parse5` 또는 `jsdom` 사용 (정규식 XSS 우회 가능)
- **성능 예산**: `tablet-performance-roadmap.md §2c` 12항목 강제 — TTI <3s · 번들 <500KB gzip · 카탈로그 iframe 0 강제 · 모달 iframe 1개만 + about:blank 언마운트 · LRU 상한 3 · 썸네일 160×120 WebP 서버 Playwright 생성 · 토큰 p95 <200ms · 플레이 iframe 60fps·<100MB·비활성 5분 언마운트 · 1h 메모리 <500MB
- **감사 보존**: 7일 미활성 자동 익명화 (studentId→null, classroomId 유지) · Free 120일 하드 삭제 · Pro 365일 하드 삭제 (Seed 12 관례 승계)
- **API Key 보안**: env 보관 금지 — CanvaConnectAccount 스타일 DB 암호화 + 교사별 스코프 + 일일 비정상 소비 Slack 경보 + 서버 프록시 전용(클라 직접 호출 금지)

## 사용자 확정 대기 4건 (U-1~U-4, padlet phase0 analyst 최우선 확인)

| # | 항목 | 기본값 (고정) | 영향 필드 | 확정 시점 |
|---|------|-------------|---------|---------|
| U-1 | 모더레이션 정책 초기값 | `teacher_approval_required` | `VibeArcadeConfig.moderationPolicy` | **padlet phase0 수용 직후** |
| U-2 | 리뷰 작성자 표시 | `named` (실명·번호) | `VibeArcadeConfig.reviewAuthorDisplay` | UX 와이어프레임 최종화 전 |
| U-3 | 리뷰 평가 시스템 | `stars_1_5` | `VibeArcadeConfig.reviewRatingSystem` | UX 와이어프레임 최종화 전 |
| U-4 | 학급 간 공유 범위 | `false` (반 내부만) | `VibeArcadeConfig.crossClassroomVisible` | Seed 2 학교 플랜 v2 설계 전 |

4건 모두 `VibeArcadeConfig` 필드로 이미 구조화 — 기본값 변경이 스키마 변경이 아니며 런칭 후에도 교사 대시보드 탭4에서 학급 단위 조정 가능. phase0 분석 블로커 아님.

## 파킹 분기 (F-1~F-7, v1 편입 금지)

- **F-1** 학생 신뢰 등급 시스템 (`Student.vibeTrustTier`) — v1.5/v2
- **F-2** "좋아요 화폐" StudentAccount 연동 — 별도 시드
- **F-3** 학부모 자녀 작품 열람 — parent-viewer 후속 시드 (phase5 integrate에서 parent-viewer-roadmap §5 예고 노트 완료)
- **F-4** Remix 기능 v2 (`VibeProject.remixedFromId`) — v2 (allowRemix=false 기본)
- **F-5** 학급 Best Of 주간 + 학기말 포트폴리오 PDF (canva-assignment-pdf-merge 재활용) — v2
- **F-6** Pyodide Python 보드 분리 (`vibe-arcade-python`) — v2
- **F-7** 스쿨마스터 2026 연동 — 관찰만

## 삭제·보관 정책

- padlet feature pipeline 소비 완료 시 삭제 가능 (INBOX/README.md 정책 준수).
- 삭제 전 `context_links.md` 상 원본 ideation 문서 경로는 유지되므로 역추적 가능. ideation 측 원본(`ideation/tasks/2026-04-20-vibe-coding-arcade/`·`ideation/plans/vibe-arcade-roadmap.md`)은 불변 참조처.

## Related ideation docs

- `ideation/plans/vibe-arcade-roadmap.md` (phase5 신규 — VA-1~VA-12 작업 분할 · §2 성능 예산 · §3 쿼터 회계 · §4 모더레이션 SOP)
- `ideation/plans/tablet-performance-roadmap.md#2c-vibe-arcade-레이아웃-성능-예산-seed-13` (phase5 신규 섹션 · phase9 QA 게이트 12항목)
- `ideation/plans/seeds-index.md#seed_vibe_arcade_v1_2026_04_20` (Seed 13 섹션 · 9개 의존선 포함)
- `ideation/plans/phase0-requests.md` (VA-1 + VA-2~VA-12 통합 2개 블록)
- `ideation/plans/parent-viewer-roadmap.md` (§5 F-3 예고 노트 추가)
- `ideation/plans/assignment-board-roadmap.md` (Seed 11 Board.layout 확장 패턴 기준)
- `ideation/plans/assessment-autograde-roadmap.md` (Seed 12 LLM provider 추상화 기준)
- `ideation/ideas-parking-lot.md` (게임 제작 보드 섹션 슈퍼시드 배너 + F-1/F-2/F-5/F-7 신규 섹션)
- `ideation/tasks/2026-04-20-vibe-coding-arcade/phase1/exploration.md` (경쟁·UX·보안 탐색)
- `ideation/tasks/2026-04-20-vibe-coding-arcade/phase2/sketch.md` (엔티티 6종 스키마 초안 · D-1~D-8 · R-1~R-11)
