# Design Brief — statistics-class-board

## 1. 화면/상태 목록

### 화면 A: 학생용 미션 보드 (StatisticsBoardClient)

| 상태 | 시각적 표현 | 사용자 행동 | 시스템 반응 |
|---|---|---|---|
| **empty** | "아직 팀원이 없습니다" 배너 + read-only 미션 스텝퍼 | — | 교사가 팀 배정 전까지 폼 비활성화 |
| **loading** | 스켈레톤 스텝퍼 (회색 박스 11개) + 스피너 | — | `GET /api/sections/:sid/missions` 완료 대기 |
| **ready** | 수직 스텝퍼 + 현재 미션 확장 패널 | 미션 클릭, 폼 입력, 저장, 제출 | 낙관적 업데이트 또는 API 호출 |
| **error** | "미션을 불러올 수 없습니다" + 재시도 버튼 | 재시도 클릭 | 데이터 재요청 |
| **success** | 토스트 "승인 요청이 전송되었습니다" 또는 "🎉 모든 미션 완료!" | — | 3초 후 토스트 자동 사라짐 |

### 화면 B: 교사용 대시보드 (TeacherDashboard)

| 상태 | 시각적 표현 | 사용자 행동 | 시스템 반응 |
|---|---|---|---|
| **empty** | "아직 팀이 없습니다. 브레이크아웃룸을 설정해 주세요." + 설정 버튼 | 브레이크아웃 설정 클릭 | 보드 설정 패널 열림 |
| **loading** | 테이블 스켈레톤 (5행) + 스피너 | — | `GET /api/boards/:bid/missions/dashboard` 대기 |
| **ready** | 팀 진행 표 + 승인 대기 알림 배지 | 필터링, 승인/반려 클릭 | 상태 업데이트 + 다음 미션 잠금 해제 |
| **error** | "대시보드를 불러올 수 없습니다" + 재시도 버튼 | 재시도 클릭 | 데이터 재요청 |

### 화면 C: 질문 사다리 입력 (Mission2QuestionLadder — 학생)

| 상태 | 시각적 표현 | 사용자 행동 | 시스템 반응 |
|---|---|---|---|
| **empty** | 모든 단계 축소, "단계를 클릭해서 입력을 시작하세요" 안내 | 단계 클릭 | 아코디언 확장 + textarea 포커스 |
| **ready** | 확장된 단계 textarea + 예시 풍선 | 텍스트 입력 | 클라이언트 state 업데이트 (자동 저장 없음) |
| **loading (LLM)** | "AI가 조언을 준비하고 있어요..." + 점dot 애니메이션 | — | API 응답 대기, 입력 차단 없음 |
| **error (LLM)** | "조언을 불러올 수 없어요. 다시 시도해 주세요." + 재시도 버튼 | 재시도 클릭 | API 재호출 |
| **success (LLM)** | 하단에 말풍선 형태 피드백 카드 표시 | — | content.questionLadder.llmFeedback 저장 |

### 화면 D: 승인/반려 패널 (ApprovalPanel — 교사)

| 상태 | 시각적 표현 | 사용자 행동 | 시스템 반응 |
|---|---|---|---|
| **ready** | 학생 산출물 미리보기 + 승인/반려 버튼 | 승인 또는 반려+피드백 입력 | 상태 변경 + 다음 미션 제어 |
| **success** | "승인 완료" 토스트 + 🟢 상태 배지로 전환 | — | SSE emit 또는 폴리시 업데이트 |
| **error** | "처리에 실패했습니다" 토스트 | — | 에러 로그 기록, 상태 롤백 |

---

## 2. 정보 계층

### 화면 A (학생용) 정보 우선순위

```
[1순위] 현재 미션 상태 + 행동 유도
        └─ "지금 우리 팀은 미션 2를 하고 있어요" (상단 고정 배너)
        └─ 현재 미션 패널: 흰색 카드(--color-surface) + 그림자(--shadow-card)

[2순위] 미션 내용 입력 영역
        └─ 아코디언/textarea — 패널 내 80% 영역 차지
        └─ 예시 문구: --color-text-faint, 13px Label

[3순위] 전체 11단계 맥락
        └─ 수직 스텝퍼 좌측 — 현재 단계 강조(--color-accent), 완료 단계 체크마크
        └─ 미래 단계: --color-text-faint + 잠금 아이콘
```

### 시선 흐름

```
1. 상단 "지금 우리 팀은..." 배너 (한눈에 현재 위치 파악)
2. 좌측 스텝퍼에서 현재 미션 확인 (파란색 강조)
3. 중앙 확장 패널에서 폼 입력 시작
4. 하단 액션 바에서 저장/제출
5. (교사만) 우측 상단 "대시보드" 버튼 → 교사용 오버뷰
```

---

## 3. 인터랙션 명세

### 3-1. 미션 스텝퍼

| 사용자 행동 | 시스템 반응 | 마이크로 인터랙션 |
|---|---|---|
| 미션 항목 클릭 | 해당 미션 패널 확장, URL `?step=N` 업데이트 | 200ms ease-out 높이 전환, --shadow-lift 적용 |
| 잠긴 미션 클릭 | "이전 미션을 먼저 완료해 주세요" 토스트 | 흔들림(shake) 애니메이션 300ms |
| 현재 미션 재클릭 | 패널 축소 | 150ms ease-in 높이 전환 |

### 3-2. 질문 사다리 아코디언

| 사용자 행동 | 시스템 반응 | 마이크로 인터랙션 |
|---|---|---|
| 단계 헤더 클릭 | textarea 영역 확장/축소 | 200ms slideDown/slideUp, 화살표 아이콘 180° 회전 |
| textarea 포커스 | 예시 풍선 페이드 인 | 150ms opacity 0→1, --color-accent-tinted-bg 배경 |
| AI 조언 버튼 클릭 | 하단에 로딩 dot → 피드백 말풍선 | dot 3개 순차 bounce 1.2s, 말풍선 200ms scale-up |
| 저장 버튼 클릭 | "저장되었습니다" 토스트 | 버튼 100ms scale(0.95) → 원래, 토스트 하단에서 300ms slide-up |
| 완료 버튼 클릭 | 확인 모달 → 승인 요청 | 모달 200ms fade-in + scale(0.95→1) |

### 3-3. 교사 승인

| 사용자 행동 | 시스템 반응 | 마이크로 인터랙션 |
|---|---|---|
| 승인 버튼 클릭 | 상태 🟡→🟢 전환, 다음 미션 잠금 해제 | 300ms 배경색 전환, 잠금 아이콘 200ms fade-out |
| 반려 버튼 클릭 | 피드백 textarea 노출 → 반려 확인 | 200ms slideDown, 반려 버튼 --color-danger 활성화 |
| 대시보드 필터 클릭 | 해당 상태 팀만 표시 | 150ms 행 fade-out/fade-in, 카운트 뱃지 bounce |

### 3-4. 토스트/알림

- 모든 성공/에러 토스트는 하단 중앙 고정, 3초 후 자동 사라짐
- 교사 승인 요청 알림은 상단 네비게이션 배지(빨간 점)로 표시
- LLM 피드백은 인라인 말풍선으로 표시 (토스트 아님)

---

## 4. 접근성 요구

### 4-1. 키보드 전용 동작

- **Tab/Shift+Tab**: 미션 스텝퍼 항목 간 이동
- **Enter/Space**: 현재 초점 미션 확장/축소 (아코디언 동작)
- **ArrowUp/ArrowDown**: 아코디언 내 단계 간 이동 (확장 상태에서)
- **Ctrl+S**: 폼 저장 단축키 (학생용 패널에서만)
- **Escape**: 확장된 패널/모달 닫기

### 4-2. 스크린리더 지원

- 미션 스텝퍼: `role="tablist"`, 각 항목 `role="tab"`, `aria-selected`, `aria-controls="panel-id"`
- 아코디언: `role="region"`, `aria-expanded`, `aria-labelledby="step-header-id"`
- 상태 배지: `aria-label="미션 2, 상태: 수정 중"`
- LLM 피드백 말풍선: `role="status"`, `aria-live="polite"`
- 승인/반려 버튼: `aria-pressed` (토글 상태인 경우)

### 4-3. 명도 대비 / 포커스 가시성

- 모든 텍스트는 기존 토큰 사용 (`--color-text` on `--color-surface` = WCAG AA 이상)
- `--color-accent-tinted-text` (`#097fe8`)로 포커스 아웃라인: `outline: 2px solid var(--color-accent-tinted-text); outline-offset: 2px;`
- `--color-status-returned-text` (`#c62828`) 반려 상태: 흰색 배경 위 4.5:1 이상
- 입력 필드 placeholder: `--color-text-faint` (`#a39e98`) — 본문 배경(`#ffffff`) 위 3:1 이상 (placeholder는 AA large 기준 충족)

---

## 5. 디자인 시스템 확장 여부

### 5-1. 기존 토큰/컴포넌트로 커버 가능

| 요소 | 기존 자산 | 재활용 근거 |
|---|---|---|
| 카드/패널 | `--color-surface`, `--shadow-card`, `--radius-card` | 미션 패널 = 기존 카드와 동일한 표면 |
| 버튼 | `--radius-btn: 4px`, `--color-accent` | 저장/제출/승인 버튼 |
| 뱃지 | `--radius-pill`, 시맨틱 상태색 | 상태 배지(⬜🟡🟢🔵✅) — 시맨틱 토큰 매핑 |
| 사이드패널 | `SidePanel` 컴포넌트 (2026-04-13) | 교사 승인/반료 패널 |
| 입력 필드 | 기존 input/textarea 스타일 | 질문 사다리 textarea |
| 토스트 | 기존 토스트 시스템 | 저장/승인/에러 알림 |

### 5-2. 신규 토큰 필요

| 토큰 | 값 | 용도 | 추가 위치 |
|---|---|---|---|
| `--color-status-pending-bg` | `#fff8e1` | 승인 대기 뱃지 배경 | `src/styles/base.css` |
| `--color-status-pending-text` | `#f57f17` | 승인 대기 뱃지 텍스트 | `src/styles/base.css` |
| `--color-status-approved-bg` | `#e8f5e9` | 승인 완료 뱃지 배경 | `src/styles/base.css` (이미 `--color-status-reviewed-bg`와 동일, alias 고려) |
| `--color-status-approved-text` | `#2e7d32` | 승인 완료 텍스트 | `src/styles/base.css` (이미 `--color-status-reviewed-text`와 동일, alias 고려) |

> **결정**: `--color-status-reviewed-*`를 그대로 재활용하고 alias로만 등록. 순신규 토큰은 pending 배경/텍스트 2개만.

### 5-3. 신규 컴포넌트 필요

| 컴포넌트 | 설명 | 기존 컴포넌트 재활용 |
|---|---|---|
| `MissionStepper` | 수직 11단계 스텝퍼 + 상태 아이콘 | 없음 (신규) |
| `QuestionLadderAccordion` | 6단계 아코디언 + 예시 풍선 | 기존 아코디언 패턴 없음 (신규) |
| `LlmFeedbackBubble` | AI 피드백 말풍선 카드 | `Card` 스타일 재활용 가능 |
| `TeacherDashboard` | 교사용 팀 진행 표 + 필터 | 기존 테이블/뱃지 재활용 |
| `ApprovalPanel` | 승인/반려 사이드패널 | `SidePanel` 래퍼 + 내부 폼 신규 |
| `MissionActionBar` | 저장/완료 버튼 고정 하단 바 | 기존 모달 액션바 패턴 재활용 |

### 5-4. CSS 파일 추가

- `src/styles/statistics.css` — 위 신규 컴포넌트 전용 유틸리티 클래스
- `globals.css`에 `@import "statistics.css"` 추가
- 예상 클래스: `.mission-stepper`, `.mission-step-item`, `.mission-step-active`, `.mission-step-locked`, `.question-ladder-accordion`, `.ladder-step-header`, `.ladder-step-body`, `.llm-feedback-bubble`, `.teacher-dashboard`, `.team-progress-table`, `.approval-panel`
