# MANIFEST — 수행평가 자동채점 v1 (padlet 수신)

## 배송 메타

- **Topic**: Aura-board 수행평가 자동채점 파이프라인 — MCQ 결정론 채점 + SHORT Gemini 2.5 Flash 채점, 화면이탈 잠금 Supabase 영속화, 교사 확정·릴리스 후 Aura 웹앱 성적탭 Realtime 반영
- **Motivation**: 교사의 인쇄·수기 채점·엑셀 입력·학부모 통보 다단계 수작업을 단일 보드 앱 안에서 출제·응시·채점·공개 완결 플로우로 치환. MCQ는 서버 결정론, SHORT는 LLM 1차 제안 + 교사 확정. BYOD 부정행위는 화면이탈 잠금 영속화로 구조적 차단.
- **Scope**: `full_exploration`
- **Destination**: padlet INBOX (primary — 보드 앱이 출제·응시·자동채점·교사 확정·부정행위 감독 실구현 담당)
- **Sibling destination**: aura INBOX (`../aura/INBOX/2026-04-16-performance-assessment-autograde/`) — 동일 task 이중 배송. Aura 웹앱 `/aura-web/gradebook` 수신 측 실구현은 sibling 번들 참조.
- **Routing reason**: 보드 앱이 AssessmentTemplate/Question/Submission/Answer/GradebookEntry/ProctorEvent CRUD + grading worker + Realtime publish + PGMQ grading_retry consumer + unlock RPC + FeatureFlag gate 전 영역 소유. Aura 웹앱은 Realtime subscribe + parent view 렌더만 담당.
- **Seed ID**: `seed_0badf1e571bc` (ambiguity 0.10, ≤ 0.2 게이트 통과)
- **Parent seed**: — (수퍼시드 없음, 신규)
- **Supersedes**: —
- **Delivered at**: 2026-04-16T00:00:00+09:00 (KST)
- **Pipeline**: ideation → padlet feature pipeline (padlet/prompts/feature/_index.md phase0 analyst 진입)

## 번들 구성

| 파일 | 역할 |
|---|---|
| `MANIFEST.md` | 본 파일 (배송 메타) |
| `request.json` | padlet feature phase0 request (소비 진입점) |
| `handoff_note.md` | 에이전트 프롬프트 (배경·제약·acceptance_criteria·교차 프로젝트 규약) |
| `seed.yaml` | 시드 원본 (Source of Truth) |
| `decisions.md` | phase3 Ouroboros 인터뷰 2회차 결정 이력 |
| `context_links.md` | ideation 내 관련 문서 상대 경로 모음 |

## 소비 가이드

1. `handoff_note.md` → 필수 독해 순서대로 `ideation/plans/*.md` + `tasks/.../phase{1,2,3}/*` 참조.
2. `request.json` → padlet feature pipeline phase0 analyst가 소비.
3. 구현 중 결정 흔들림 시 `seed.yaml.exit_conditions.scope_overflow` 준수 — OX/NUMERIC/ESSAY 구현 시도·자동 처벌·LLM 프로바이더 교체·잠금 해제 권한 확장은 즉시 중단.
4. Aura 웹앱 측 수신 작업은 sibling aura INBOX 번들로 별도 진행 — padlet 측은 Realtime publish + GradebookEntry write까지만 책임.

## 교차 프로젝트 정합 체크리스트 (aura 공유 규약)

- [ ] Supabase 단일 프로젝트 공유, 스키마 migration owner = padlet
- [ ] Realtime channel `assessment:{id}` publish/subscribe 포맷 aura와 동일
- [ ] PGMQ `grading_retry` 는 padlet 전용 (aura 미구독)
- [ ] FeatureFlag `assessmentTierGate` 단일 source, 토글 시 양쪽 캐시 무효화
- [ ] RLS 3분화 정책 aura와 완전 동일 (teacher / student / parent)
- [ ] `GradebookEntry.releasedAt` 단일 공개 판별 컬럼 (aura는 read-only 소비)
- [ ] `Classroom.gradebookReleasePolicy="teacher_manual"` 고정, 릴리스 버튼은 padlet 소유
- [ ] ProctorEvent·autoRawResponse는 padlet 전용 (aura 비노출)
- [ ] 감사 로그 보관 Free=1학기 / Pro=학년 — 양쪽 쿼리 전제 일치

## 삭제·보관 정책

- padlet feature pipeline 소비 완료 시 삭제 가능 (INBOX/README.md 정책 준수).
- 삭제 전 `context_links.md` 상 원본 ideation 문서 경로는 유지되므로 역추적 가능.

## Related ideation docs

- `ideation/plans/assessment-autograde-roadmap.md` (phase5 신규)
- `ideation/plans/assignment-board-roadmap.md` (확장 기반)
- `ideation/plans/tablet-performance-roadmap.md` (성능 예산)
- `ideation/plans/parent-viewer-roadmap.md` (RLS·공개 정책 승계)
- `ideation/plans/canva-publisher-receiver-roadmap.md` (Realtime·PAT 패턴 참고)
- `ideation/plans/seeds-index.md` (시드 인덱스)
- `ideation/tasks/2026-04-16-performance-assessment-autograde/phase1/exploration.md`
- `ideation/tasks/2026-04-16-performance-assessment-autograde/phase2/sketch.md`
