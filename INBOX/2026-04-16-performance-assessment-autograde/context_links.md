# Context Links — 수행평가 자동채점 v1 (padlet 번들)

ideation 저장소 내 관련 문서. 경로는 ideation 루트 기준 상대 경로.

## 살아있는 설계 문서 (plans/)

- `plans/assessment-autograde-roadmap.md` — 본 피처의 단계별 구현 로드맵 (phase5 신규)
- `plans/assignment-board-roadmap.md` — 기반 과제 보드 설계 (확장 관계)
- `plans/tablet-performance-roadmap.md` — 갤럭시 탭 S6 Lite 성능 예산 (강제)
- `plans/parent-viewer-roadmap.md` — 학부모 뷰어 RLS·공개 정책 규약 (승계)
- `plans/canva-publisher-receiver-roadmap.md` — Realtime·PAT 패턴 참고
- `plans/implementation-roadmap.md` — Canva 통합 전체 로드맵 맥락
- `plans/seeds-index.md` — 전체 시드 인덱스 (본 시드 `seed_0badf1e571bc` 등록됨)

## task 산출물 (tasks/2026-04-16-performance-assessment-autograde/)

- `phase0/request.json` — 초기 요청
- `phase1/exploration.md` — 경쟁·패턴·기술 탐색 (부정행위 방지 F축, OCR B축 포함)
- `phase2/sketch.md` — 데이터 모델 초안 (AssessmentTemplate/Question/Submission/Answer/GradebookEntry/ProctorEvent 7 엔티티)
- `phase3/decisions.md` — Ouroboros 인터뷰 2회차 결정 이력 (§1~§7)
- `phase4/seed.yaml` — 시드 원본 (`seed_0badf1e571bc`, ambiguity 0.10)
- `phase5/updated_docs.md` — 살아있는 문서 업데이트 이력
- `phase5/new_docs.md` — 신규 문서 (`assessment-autograde-roadmap.md`) 작성 이력
- `phase6/padlet_phase0_request.json` — padlet 인수인계 request
- `phase6/handoff_note.md` — 에이전트 프롬프트

## 참조 시드 (이 시드의 전제)

- `seed_38c34e91bf28` — assignment-board (제출물 수거 계층, 본 시드가 확장)
- `seed_6d7077aac472` — parent-viewer v2 (RLS 3분화·릴리스 정책 승계)
- `seed_canva_publisher_receiver` — Canva PAT·Realtime 패턴 참고

## 메모리·정책

- `CLAUDE.md` — ideation 오케스트레이션 루트
- `/home/coseung2/.claude/projects/.../memory/MEMORY.md` — 방침 (갤탭 S6 Lite / 매트릭스 뷰 owner+데스크톱 전용 / 자율 진행 / 품질 우선)
