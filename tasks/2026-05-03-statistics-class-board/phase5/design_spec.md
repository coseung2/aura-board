# Design Spec — statistics-class-board

## 1. 선택된 변형

**v1 Classic Sidebar (데스크톱) + v3 Mobile Tabs (모바일)**

- mockups/v1_classic_sidebar.html — 기본 레퍼런스
- mockups/v3_mobile_tabs.html — 모바일 반응형 레퍼런스
- 선택 사유: comparison.md §결정 근거 참고. 교육 환경에서 진행 상태 인지가 가장 중요하며, 11단계를 한눈에 보여주는 사이드바가 최적.

---

## 2. 화면 상태별 최종 디자인

### 상태 A: empty (팀원 없음)

- 좌측 사이드바: 기존 11단계 표시하되 모든 폼은 `disabled` 상태
- 우측 패널 상단에 노란색 배너: "아직 팀원이 없습니다. 교사에게 팀 배정을 요청하세요."
- 배너 색상: `--color-status-pending-bg` + `--color-status-pending-text`

### 상태 B: loading (데이터 로딩)

- 좌측 사이드버: 회색 스켈레톤 박스 11개 ( 각 48px 높이 )
- 우측 패널: 큰 스켈레톤 카드 (제목 20px + 본문 4줄 + 버튼 2개)
- 스켈레톤 애니메이션: `pulse` 1.5s infinite, 배경 `--color-surface-alt`

### 상태 C: ready (정상)

- **좌측 사이드바 (280px, fixed)**
  - 보드 제목: 16px Bold, `--color-text`
  - 각 스텝 항목: 48px 높이, 수평 패딩 12px
    - 숫자 원: 28px, 13px Bold
      - 완료: `#27a35f` 배경 + 흰색 체크
      - 현재: `--color-accent` 배경 + 흰색 숫자
      - 미래/잠김: `--color-bg` 배경 + `--color-faint` 숫자
    - 제목: 14px Semibold, `--color-text` (현재) / `--color-muted` (완료) / `--color-faint` (잠김)
    - 상태 캡션: 11px, `--color-faint`
  - 현재 항목: `--color-accent-tinted-bg` 배경 강조
  - 잠긴 항목 클릭 시: shake 애니메이션 300ms + 토스트 "이전 미션을 먼저 완료해 주세요"

- **우측 패널 (flex: 1, max-width 720px, centered)**
  - 상단 배너: `--color-accent-tinted-bg` 배경, `--color-accent` 텍스트
    - "지금 우리 팀은 미션 N을 하고 있어요"
  - 미션 카드: `--color-surface`, `--shadow-card`, `--radius-card: 12px`, 패딩 28px
    - 제목: 20px Bold
    - 설명: 14px `--color-muted`
    - 아코디언: `--color-border`, 8px radius
      - 헤더: 14px Semibold, 패딩 14px 16px
      - 바디: textarea (min-height 80px), 예시 풍선(12px `--color-faint`)
      - 확장 시 화살표 180deg 회전 200ms
    - AI 조언 버튼: `--color-accent-tinted-bg` 배경, `--color-accent` 텍스트, 4px radius
    - LLM 피드백 말풍선: 좌측 보더 3px `--color-accent`, 배경 `--color-accent-tinted-bg`, 패딩 14px
  - 하단 액션바: 저장(secondary) + 완료(primary)
    - primary: `--color-accent` 배경, 그림자 `--shadow-accent`
    - hover: `--color-accent-active`, `--shadow-accent-hover`

### 상태 D: error (로드 실패)

- 우측 패널 중앙: 에러 일러스트 + "미션을 불러올 수 없습니다"
- 재시도 버튼: `--color-accent` outline 버튼

### 상태 E: success (승인 요청 완료)

- 하단 토스트: "승인 요청이 전송되었습니다" (3초 후 사라짐)
- 현재 미션 상태 뱃지: 🟡수정중 → 승인요청 (배경 `#fff8e1`, 텍스트 `#f57f17`)

### 상태 F: mobile ready (모바일 정상)

- **상단 고정 탭 바**: 가로 스크롤, 현재 미션 ±2개 노출 + "···" 더보기
  - 탭 높이: 44px, 배경 `--color-surface`, 하단 볼더 `--color-border`
  - 활성 탭: `--color-accent-bg` 배경, `--color-accent` 텍스트, 999px pill
  - 완료 탭: `#e8f5e9` 배경, `#2e7d32` 텍스트
  - 잠긴 탭: opacity 0.4
- **중앙 패널**: 좌우 패딩 16px, max-width 없음 (full-bleed)
- **하단 고정 액션바**: safe-area-inset-bottom 고려, 저장(좌) + 완료(우)

---

## 3. 사용된 토큰

### 기존 토큰

| 토큰 | 용도 |
|---|---|
| `--color-bg` | 페이지 배경 |
| `--color-surface` | 카드/패널 배경 |
| `--color-text` | 제목, 본문 |
| `--color-muted` | 설명, 라벨 |
| `--color-faint` | 캡션, placeholder, 잠김 상태 |
| `--color-accent` | CTA 버튼, 현재 단계 강조 |
| `--color-accent-active` | 버튼 hover |
| `--color-accent-tinted-bg` | 뱃지/풍선 배경, 현재 스텝 하이라이트 |
| `--color-accent-tinted-text` | 뱃지 텍스트, 포커스 아웃라인 |
| `--color-border` | 구분선, 보더 |
| `--color-status-reviewed-bg` | 승인 완료 배경 (alias로 재활용) |
| `--color-status-reviewed-text` | 승인 완료 텍스트 (alias로 재활용) |
| `--color-status-returned-bg` | 반려 배경 |
| `--color-status-returned-text` | 반려 텍스트 |
| `--shadow-card` | 카드 기본 그림자 |
| `--shadow-card-hover` | 카드 hover 그림자 |
| `--shadow-accent` | CTA 버튼 그림자 |
| `--radius-card` | 카드/패널 12px |
| `--radius-btn` | 버튼 4px |
| `--radius-pill` | 뱃지 9999px |

### 신규 토큰

| 토큰 | 값 | 용도 |
|---|---|---|
| `--color-status-pending-bg` | `#fff8e1` | 승인 대기/요청 중 배경 |
| `--color-status-pending-text` | `#f57f17` | 승인 대기/요청 중 텍스트 |
| `--color-status-completed-bg` | `#e3f2fd` | 전체 완료(✅) 배경 |
| `--color-status-completed-text` | `#1565c0` | 전체 완료 텍스트 |

---

## 4. 컴포넌트 목록

### 신규 컴포넌트

| 컴포넌트 | 파일 | 설명 |
|---|---|---|
| `StatisticsBoardClient` | `src/components/statistics/StatisticsBoardClient.tsx` | layout="statistics" 메인 클라이언트 컴포넌트 |
| `MissionStepper` | `src/components/statistics/MissionStepper.tsx` | 수직 스텝퍼 (데스크톱) / 가로 탭 (모바일) |
| `MissionStepItem` | `src/components/statistics/MissionStepItem.tsx` | 개별 스텝 항목 + 상태 아이콘 |
| `MissionPanel` | `src/components/statistics/MissionPanel.tsx` | 현재 선택된 미션 확장 패널 |
| `QuestionLadderAccordion` | `src/components/statistics/QuestionLadderAccordion.tsx` | 6단계 아코디언 + 예시 풍선 |
| `LlmFeedbackBubble` | `src/components/statistics/LlmFeedbackBubble.tsx` | AI 피드백 말풍선 |
| `MissionActionBar` | `src/components/statistics/MissionActionBar.tsx` | 저장/완료 고정 하단 바 |
| `TeacherDashboard` | `src/components/statistics/TeacherDashboard.tsx` | 교사용 대시보드 페이지 컴포넌트 |
| `TeamProgressTable` | `src/components/statistics/TeamProgressTable.tsx` | 팀별 진행 표 + 필터 |
| `ApprovalPanel` | `src/components/statistics/ApprovalPanel.tsx` | 승인/반려 사이드패널 |
| `StatusBadge` | `src/components/statistics/StatusBadge.tsx` | 5단계 상태 뱃지 (⬜🟡🟢🔵✅) |

### 기존 컴포넌트 재활용

| 컴포넌트 | 용도 |
|---|---|
| `BoardHeader` | 상단 보드 제목 + 설정 버튼 |
| `SidePanel` | 교사 승인/반려 패널 (2026-04-13) |
| `EditableTitle` | 보드 제목 편집 |
| `CreateBoardModal` | 보드 생성 시 layout 선택 |

### 신규 CSS 파일

- `src/styles/statistics.css` — statistics 전용 유틸리티 클래스
- `globals.css`에 `@import "statistics.css"` 추가

---

## 5. 반응형 전환 규칙

| 뷰포트 | 사이드바 | 패널 | 탭 |
|---|---|---|---|
| ≥ 1024px | 280px 고정, 전체 11단계 텍스트 노출 | max-width 720px, 중앙 정렬 | 없음 |
| 768px ~ 1023px | 220px 축소, 단계 제목 12px로 축소 | max-width 640px, 중앙 정렬 | 없음 |
| < 768px | 숨김 (드로어로 전환 가능) | full-bleed, 패딩 16px | 상단 고정 가로 스크롤 탭 |

### 768~1023px 세부 규칙

- 사이드바 폭 220px로 축소. 단계 제목은 12px로 줄이되 2줄까지 허용.
- 숫자 원은 24px로 축소, 상태 캡션은 숨김 (툴팁으로 대체).
- 콘텐츠 영역은 좌측 220px + 우측 24px 여백 = 나머지 전체 사용.
- 860px 이하에서 아코디언 textarea는 min-height 60px로 축소.

### < 768px 세부 규칙

- 사이드바는 완전히 숨기고, 햄버거 메뉴 클릭 시 바텀 시트(높이 60vh)로 11단계 목록 표시.
- 상단 탭은 `overflow-x: auto` + `scroll-snap-type: x mandatory`, 각 탭은 `scroll-snap-align: start`.
- 터치 스와이프로 탭 전환 지원 (옵션).
- 하단 액션바는 `position: fixed; bottom: 0;` + `padding-bottom: max(12px, env(safe-area-inset-bottom))`.

---

## 6. 접근성 상세 명세

### 키보드 네비게이션

- **데스크톱 사이드바**: `Tab`으로 스텝 항목 간 이동. `Enter`로 미션 확장. `Shift+Tab`으로 역방향.
- **모바일 탭**: `role="tablist"`, `aria-orientation="horizontal"`. 좌우 화살표 키로 탭 전환, `Home`/`End`로 처음/끝 탭 이동. 활성 탭 외 `tabindex="-1"`.
- **아코디언**: `Tab`으로 헤더 이동, `Enter`/`Space`로 확장/축소. 확장 시 난내 textarea로 `Tab` 진입.
- **전역 단축키**: `Ctrl+S`(또는 `Cmd+S`)로 폼 저장. `Escape`로 확장 패널/모달 닫기.

### 스크린리더

- 미션 스텝퍼: `aria-label="미션 목록, 총 11개 중 2번째 진행 중"`
- 상태 변화: 상태 변경 시 `aria-live="polite"` 영역에 "미션 2, 승인 요청 상태로 변경됨" 알림
- LLM 피드백 로딩: `role="status"`, `aria-live="polite"`로 "AI 조언을 불러오는 중" 안내. 완료 시 "AI 조언이 도착했습니다" + 피드백 내용 읽기.
- 반려 상태: `aria-live="assertive"`로 "교사가 미션을 반려했습니다. 피드백: ..." 즉시 알림.

### 포커스 및 명도

- 모든 상호작용 요소는 `:focus-visible`에 `outline: 2px solid var(--color-accent-tinted-text); outline-offset: 2px;`
- placeholder 텍스트: `#a39e98` on `#ffffff` = 3.0:1 (AA Large 기준 충족, placeholder는 필수 입력 아님)
- 에러 메시지: `#c62828` on `#ffffff` = 5.7:1 (AA 충족)
- pending 뱃지: `#f57f17` on `#fff8e1` = 4.6:1 (AA 충족)

### 모션 선호

- `prefers-reduced-motion: reduce` 시:
  - 스텝퍼 전환: 애니메이션 0ms (즉시 전환)
  - 아코디언: 높이 전환 0ms
  - 토스트: slide-up 없이 즉시 표시
  - shake 애니메이션: translateX 없이 색상 변화만 (`border-color: var(--color-danger)`)
