# Padlet Project Navigation

이 문서는 패들렛(Padlet) 클론 프로젝트의 entry point다. 작업 시작 시 여기서 파이프라인 분기를 결정한 뒤, 해당 파이프라인의 `prompts/{pipeline}/_index.md`로 이동한다.

## 프로젝트 목표

나만의 패들렛(Padlet) 웹앱 구현. 실시간 협업 보드, 카드 기반 콘텐츠(텍스트/이미지/링크/파일) 게시, 드래그앤드롭 레이아웃. 솔로 프로젝트.

기획 단계 상세 컨텍스트는 `_handoff.md` 참조.

## 로컬 개발 규칙

- **로컬 확인 시 항상 dev 서버를 재시작한다**: `fuser -k 3000/tcp; rm -rf .next; PORT=3000 npm run dev`
- **port 4000은 절대 건드리지 않는다** (다른 프로젝트 사용 중)
- **worktree 진입 / dev 재시작 전 .env sync**: `cp ../../../.env .env` 먼저 실행. Next.js 는 cwd 의 `.env` 만 자동 로드하는데 worktree 와 메인 root 가 분리돼 있어 root 에 추가된 새 변수가 worktree dev 서버에 반영 안 되는 사고가 반복됨. 사용자가 root `.env` 수정한 직후엔 반드시 sync.

## Git 워크플로우

- **솔로 프로젝트라 PR/리뷰어 게이트가 없다**. feature/incident 브랜치는 작업 완료 후 `main` 으로 직접 fast-forward 머지(원격 푸시) 한다. `gh pr create` 사용하지 말 것.
- 푸시 전엔 CLAUDE.md 의 push 검증 게이트(`npm run build` + `npm run typecheck` + 모든 마커 유효) 통과 필수.

## 프로젝트 구조

```
padlet/
├── CLAUDE.md                  # 이 파일. 오케스트레이션 루트
├── _handoff.md                # 기획 단계 핸드오프 노트
├── README.md                  # 사용법
├── prompts/                   # 에이전트 계약서 (파이프라인별)
│   ├── feature/               # 새 기능 추가
│   ├── incident/              # 버그/사고 대응
│   └── research/              # 기술/UX 탐색
├── docs/                      # 프로젝트 문서
│   └── design-system.md       # 디자인 시스템 (토큰/패턴/체크리스트)
├── tasks/                     # 작업 단위 산출물 (감사 이력)
│   └── {YYYY-MM-DD-slug}/
│       └── phase{N}/
└── scripts/                   # 오케스트레이터 래퍼 (TBD)
```

기술 스택(Next.js, 실시간 엔진, 스토리지 등)은 **첫 feature task의 phase3 `architect`**에서 확정되어 `docs/architecture.md`에 잠긴다. 이 문서는 프로세스를 관장하며 구현 세부는 관장하지 않는다.

---

## 에이전트 오케스트레이션

이 프로젝트의 모든 작업은 3개 파이프라인 중 하나로 분기한다. 사용자 프롬프트를 받으면 오케스트레이터(Claude Code 본체)가 `type`을 결정하고 해당 파이프라인의 Phase를 순서대로 실행한다.

### 파이프라인 분기

| type | 트리거 | 인덱스 |
|---|---|---|
| `feature` | 새 기능/화면/API 추가, 기존 기능 확장 | `prompts/feature/_index.md` |
| `incident` | 버그, 운영 사고, UX 이상 신호 | `prompts/incident/_index.md` |
| `research` | 신규 라이브러리/기술/UX 도입 검토 | `prompts/research/_index.md` |

### 작업 시작 순서

1. 사용자 프롬프트에서 `type` 결정 (모호하면 사용자에게 확인)
2. `tasks/{YYYY-MM-DD-slug}/phase0/request.json`에 `type` 기록
3. 해당 파이프라인의 `_index.md`를 읽어 전체 흐름과 검증 게이트 파악
4. Phase 순서대로 `phase{N}_{role}.md` 파일 하나씩 read → 그 phase만 처리
5. 한 phase 완료 후 검증 게이트 → 다음 phase

### Phase별 분리 구조

각 phase 파일은 짧게(50줄 안팎) 유지되어 한 phase 처리 시 컨텍스트 ~80줄만 점유한다. 공통 규칙(검증 게이트, 파이프라인 공통 규칙)은 각 파이프라인의 `_index.md`에서만 참조한다.

### 핸드오프 규칙 (전역)

1. 각 Phase는 `tasks/{task_id}/phase{N}/`에 산출물을 저장한다
2. 다음 Phase는 이전 Phase 산출물 파일만 입력으로 사용한다
3. **다운스트림은 업스트림 산출물을 임의 추정으로 보정하지 않는다** — 누락 시 해당 phase 재실행
4. 산출물 형식은 각 phase 파일의 필수 필드를 반드시 포함

### 오케스트레이터 검증 게이트 (자동)

모든 게이트는 오케스트레이터가 자동으로 판정한다. 사람 개입 없이 진행.

| 게이트 | 위치 | 자동 판정 조건 |
|---|---|---|
| **스코프 검증** | feature phase2 직후 | `scope_decision.md` 필수 필드 + 수용 기준 ≥ 3개 + 리스크 분석 존재 |
| **진단 검증** | incident phase1 직후 | `diagnosis.md` 근본 원인 + 재현 조건 + 권고안 존재 |
| **배포 검증** | feature phase9 직후 | `QA_OK.marker` 존재 + 수용 기준 전체 PASS |
| **핫배포 검증** | incident phase3 직후 | `REVIEW_OK.marker` 존재 |
| **도입 검증** | research phase3 직후 | `decision.md` 5개 평가 차원 + 판정(ADOPT/REVISE/REJECT) 존재 |
| **push 검증** | git push 직전 | `npm run build` + `npm run typecheck` 성공 + 모든 마커 유효 |

검증 실패 시 해당 phase 재실행. 3회 연속 실패 시 원인 분석 기록 후 중단.

### Karpathy Coding Guidelines (글로벌)

모든 코드 작성·편집·리팩토링 행위는 `docs/coding-principles-karpathy.md` 의 4 원칙을 준수한다:
1. **Think Before Coding** — 가정·복수 해석·단순 대안 먼저 노출, 애매하면 멈춤
2. **Simplicity First** — 요청 범위만, 투기적 추상화/유연성/에러처리 금지
3. **Surgical Changes** — 변경된 모든 줄이 요청으로 직접 추적 가능, 인접 코드 "개선" 금지
4. **Goal-Driven Execution** — 작업을 검증 가능한 목표로 변환 + 루프

적용 phase 파일에서 명시적으로 참조: `feature/phase7_coder.md`, `feature/phase8_code_reviewer.md`, `incident/phase2_hotfixer.md`, `incident/phase3_code_reviewer.md`.

### gstack 스킬 통합

각 phase 파일에는 `## gstack 스킬` 섹션이 있다. 해당 phase 실행 시 오케스트레이터는 명시된 gstack 슬래시 커맨드를 호출한다. gstack이 설치돼 있지 않으면 동일 기능을 Claude 본체 프롬프트로 수행하되, **계약(입력/출력/검증)은 동일하게 강제**한다.

gstack 설치 확인: `ls ~/.claude/skills/gstack` 존재 여부.

gstack 스킬과 에이전트 매핑 전체 표는 각 파이프라인 `_index.md`의 "Phase 순서" 표에서 phase 파일로 이동하면 개별 phase의 `## gstack 스킬` 섹션에서 확인.

### 오케스트레이터 강제 규칙

- 검증 게이트를 통과하지 않은 phase의 산출물을 다음 phase 입력으로 사용하지 않는다
- 오케스트레이터 검증 게이트를 건너뛰지 않는다 — 판정 조건 미충족 시 해당 phase 재실행
- 산출물 형식을 임의로 추정하지 않고 phase 파일의 형태를 따른다
- 파이프라인을 섞지 않는다 — `feature`로 시작했으면 incident 절차로 빠지지 않음 (필요 시 새 task)
- task 디렉토리는 작업 1건 = 디렉토리 1개로 누적
- **기술 스택 결정은 최초 feature task의 phase3에서만 내린다.** 이후 변경은 별도 research task 필요
- 프로토타입 코드(research phase2)는 제품 코드와 디렉토리 분리 — 섞지 말 것
