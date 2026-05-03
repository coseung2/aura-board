# Context Links — 학급 Steam / Vibe Coding Arcade v1 (padlet 번들)

ideation 저장소 내 관련 문서. 경로는 ideation 루트 기준 상대 경로. padlet feature pipeline analyst가 `handoff_note.md`의 필수 독해 순서에 따라 참조.

## 살아있는 설계 문서 (plans/)

- `plans/vibe-arcade-roadmap.md` — **본 피처 전용 로드맵 (Seed 13, phase5 신규)**. §1 v1 스코프 · §2 성능 예산 · §3 쿼터 회계 · §4 모더레이션 SOP · §5 v1.5/v2 파킹 F-1~F-7 · §6 연계 로드맵 · §7 작업 분할 VA-1~VA-12 (30~35일) · §8 리스크 R-1~R-11 · §9 U-1~U-4 · §10 관련 주제 · §11 변경 로그
- `plans/tablet-performance-roadmap.md` — §2·§2a 공통 예산 (Seed 5 승계) + **§2c vibe-arcade 레이아웃 성능 예산 (phase5 신규)**. 12축 성능 표 + phase9 QA 게이트 12항목
- `plans/seeds-index.md` — **Seed 13 섹션 (`#seed_vibe_arcade_v1_2026_04_20`, phase5 신규)**. 의존성 그래프 9개 의존선 + Seed 2 보조 노트(학생 바이브 코딩 쿼터 표)
- `plans/phase0-requests.md` — **VA-1 (Prisma 마이그레이션) + VA-2~VA-12 통합 블록 (phase5 신규)**. acceptance 30건 · U-1~U-4 포함
- `plans/parent-viewer-roadmap.md` — §5 Cross-cutting 자녀 범위 매트릭스에 **F-3 `vibe-arcade-child-view` 예고 노트 추가 (phase5)**. 본 시드 스코프 밖, parent-viewer 후속 시드에서 구현
- `plans/assignment-board-roadmap.md` — Seed 11 Board.layout 확장 패턴 기준 (FeatureFlag 런칭 플래그 · 전체화면 모달 UX · 서버 썸네일 리사이즈 · Pro tier 게이팅)
- `plans/assessment-autograde-roadmap.md` — Seed 12 LLM provider 추상화 + Pro tier FeatureFlag + 감사 로그 보존 관례(Free 1학기 / Pro 학년) 승계 기준
- `plans/implementation-roadmap.md` — Canva 통합 전체 로드맵 맥락 (구조적 레퍼런스)

## task 산출물 (tasks/2026-04-20-vibe-coding-arcade/)

- `phase0/request.json` — 초기 요청. 동기(Sonnet 잉여 쿼터) · target_user 3역할 · expected_outcome · 9건 known_constraints · full_exploration 판정 근거
- `phase1/exploration.md` — 경쟁·레퍼런스 비교 (Scratch·itch.io·Steam·Glitch·MakeCode Arcade·Claude Artifacts) · UX 패턴 · 쿼터 원단가(15K/세션 × 3세션 = 45K/학생·일) · 보안 스택 CSP `frame-src 'none'` 선결 제약
- `phase2/sketch.md` — 엔티티 6종 스키마 초안 · 3역할 플로우 · D-1~D-8 고정 전제 (재논의 금지) · R-1~R-11 리스크 매트릭스
- `phase3/decisions.md` — D-PHASE3-01~11 결정 11건 (7 자율 + 4 사용자 확정 대기) · §2 F-1~F-7 파킹 사유 · §3 U-1~U-4 체크리스트 · §4 ambiguity 0.13 산출 근거. **MCP_UNAVAILABLE 폴백 운영 주의**
- `phase3/session_id.txt` — Ouroboros interview MCP 미가용 상태 기록 (MCP 복구 후 재생성 권장)
- `phase4/seed.yaml` — 시드 원본 (Source of Truth). goal · constraints(9 known + 4 사용자 확정 대기 + 7 F-* 파킹 + 8 D-* 전제) · acceptance_criteria(functional 14 + non_functional 13 + ux 8 + governance 11) · ontology_schema · related_seeds · parking_branches · future_user_confirmation · handoff_notes
- `phase4/seed_id.txt` — `seed_vibe_arcade_v1_2026_04_20`
- `phase5/updated_docs.md` — 4건 갱신 이력 (seeds-index · phase0-requests · tablet-performance · parent-viewer) + 1건 추가 갱신 (ideas-parking-lot 슈퍼시드 배너 + F-1/F-2/F-5/F-7 신규 섹션)
- `phase5/new_docs.md` — 1건 신규 (`vibe-arcade-roadmap.md`) 작성 이력
- `phase6/padlet_phase0_request.json` — padlet 인수인계 request (본 번들 `request.json` 원본)
- `phase6/handoff_note.md` — 에이전트 프롬프트 (본 번들 `handoff_note.md` 원본)

## 참조 시드 (이 시드의 전제)

- `Seed 2` — Tier 매트릭스 · Sonnet 쿼터 배분 기반 (Free 접근 불가 · Pro 전용 · 학교 플랜 v2+ 게이팅 승계)
- `Seed 5` — iframe LRU 3개 · 갤럭시 탭 S6 Lite 성능 예산 (카탈로그 iframe 0 · 모달 iframe 1 · 썸네일 160×120 WebP + lazy + IntersectionObserver 패턴 승계)
- `Seed 11 (assignment-board)` — `Board.layout` enum 확장 · FeatureFlag 런칭 플래그 · 전체화면 모달 UX · 서버 썸네일 리사이즈 · Pro tier 게이팅 패턴 차용
- `Seed 12 (assessment-autograde)` — LLM provider 추상화 (`src/lib/llm/providers/anthropic-sonnet.ts` 1개 추가) · IndexedDB autosave 패턴 · 감사 로그 보존 관례(Free 1학기 / Pro 학년) 승계
- `Seed 7 v2 (parent-viewer)` — §5 매트릭스에 `vibe-arcade-child-view` 예고 노트 추가(phase5 완료). 본 시드 phase5 integrate 단계에서만 수정, 실제 학부모 UI 구현은 parent-viewer 후속 시드 스코프

## 슈퍼시드 관계

- `ideas-parking-lot.md#게임-제작-보드-마인크래프트-느낌` — **V1 MakeCode Arcade 임베드안을 본 시드가 Sonnet 바이브 코딩 경로로 재정의하며 슈퍼시드**. phase5 integrator가 해당 섹션 상단에 슈퍼시드 배너 추가 완료. phase7 dispatcher 본 배송 직후 `destinations/archive/` 이동 마킹은 후속 작업(본 INBOX 배송 스코프 외)
- **영향 없는 V2/V3 파생 아이디어**: MakeCode Arcade 외의 파생 아이디어는 본 시드로 대체되지 않음 — `ideas-parking-lot.md` 동일 섹션 참조

## 메모리·정책

- `CLAUDE.md` — ideation 오케스트레이션 루트 (자율 진행 · padlet 읽기 전용 · phase 간 핸드오프 원칙 · gstack/Ouroboros 스킬 통합)
- `/home/coseung2/.claude/projects/-mnt-c-Users-----Desktop-Obsidian-Vault-ideation/memory/MEMORY.md` — 사용자 방침 (갤럭시 탭 S6 Lite 기준 / 자율 진행 / 품질 우선 / 초중등 안전)

## padlet 측 소비 진입점

- `padlet/prompts/feature/_index.md` — 피처 파이프라인 순서 (phase0 analyst → phase1 architect → ...). 파일 읽기 전용 참조
- `padlet/prompts/feature/phase0_analyst.md` — 포맷 참조 · 본 번들 `request.json` 수용 규약
- `padlet/INBOX/README.md` — INBOX 소비·삭제 정책
