# Design Spec — quiz-extensions

task_id: 2026-04-15-quiz-extensions
selected: mockups/v1 (Stacked Cards)

## 1. 선택된 변형

**v1 — Stacked Cards**.

사유 (comparison.md 참조):
- 구현 단순 + 기존 카드/폼 토큰 재사용 (tokens_patch 최소).
- 태블릿 baseline(갤탭 S6 Lite) 안정성 우위.
- MVP 문항 10개 상한 내 스크롤 허용 가능.
- v2 2×2 는 LLM 평균 보기 길이(20자+) 와 궁합 나쁨 → 기각 (`rejected/v2.md`).
- v3 accordion 은 문항 20+ 시 효과 크지만 현 상한 10 에서 과설계 → 기각 (`rejected/v3.md`).
- v4 split 은 드래그 재정렬 OUT 과 상충 → 기각 (`rejected/v4.md`).

## 2. 화면 상태별 최종 디자인

### QuizGenerateModal

**공통 접근성**:
- Esc 키로 닫기. 오픈 시 첫 interactive 요소(탭 "새로 만들기")에 자동 focus.
- Tab/Shift+Tab 순회는 모달 내부로 제한 (focus trap — 기존 ModalShell 패턴 재사용).
- 상단 탭은 두 탭 동일 폭, active 탭은 하단 `2px solid var(--color-accent)` underline + `font-weight: 600`. inactive 탭은 `--color-text-muted`.

#### step1 — 옵션 입력 (탭: 새로 만들기)
```
┌─ 퀴즈 만들기 ──────────────────────── ✕ ─┐
│  [새로 만들기*] [과거 퀴즈]               │
├───────────────────────────────────────────┤
│                                           │
│  주제 또는 내용                           │
│  ┌───────────────────────────────────┐   │
│  │                                   │   │
│  │                                   │   │
│  └───────────────────────────────────┘   │
│  [ 📎 파일 첨부 ]                         │
│                                           │
│  난이도   [쉬움]  [*중간*]  [어려움]      │
│  문항 수  ● AI가 정함                      │
│           ○ 직접 지정 [ 10 ] (1~20)        │
│                                           │
│                          [퀴즈 생성 →]    │
└───────────────────────────────────────────┘
```
- 난이도 = SegmentedControl (3버튼). active 는 `--color-accent` + 흰 텍스트.
- 문항 수 = RadioGroup 2개 (`auto` / `fixed`). `fixed` 선택 시에만 숫자 입력(`<input type="number" min="1" max="20" step="1" />`) 활성, `auto` 선택 시 입력 disabled + opacity 0.5. 라벨 "AI가 정함" / "직접 지정". 기본값 `auto`.
- `ChipGroup` 은 이 feature 에서 사용 안 함 → **컴포넌트 목록에서 제거** (SegmentedControl 만 신규).

#### step1 — 과거 퀴즈 탭 (ready)
```
┌─ 퀴즈 만들기 ──────────────────────── ✕ ─┐
│  [새로 만들기] [*과거 퀴즈*]              │
├───────────────────────────────────────────┤
│  ┌──────────────────────────────────────┐│
│  │ ☐ 과학 - 태양계 (5문항)              ││
│  │   2026-04-10 · 3학년 1반             ││
│  ├──────────────────────────────────────┤│
│  │ ☑ 국어 - 한글 어휘 (10문항)          ││
│  │   2026-04-08 · 3학년 1반             ││
│  ├──────────────────────────────────────┤│
│  │ ☐ 수학 - 분수 (5문항)                ││
│  │   2026-04-05 · 3학년 2반             ││
│  └──────────────────────────────────────┘│
│  [ 더 보기 ]                              │
│                     [이 퀴즈 재사용 →]    │
└───────────────────────────────────────────┘
```

#### step1 — empty library
```
┌─ ... [과거 퀴즈] ─┐
│                   │
│   📚              │
│   만든 퀴즈가     │
│   없습니다        │
│                   │
│  [새로 만들기로]  │
└───────────────────┘
```

#### step1 — generating
```
│  ⟳ AI 가 문제를 만들고 있어요 (5~15초)   │
│  [취소]                                   │
```

#### step1 — error
```
│  ⚠ 생성에 실패했어요: 네트워크 오류       │
│  [다시 시도]                              │
```

#### step2 — draft editor
```
┌─ 퀴즈 편집 ──────────────────────── ✕ ─┐
│  ← 돌아가기                       저장 │
├─────────────────────────────────────────┤
│                                         │
│  ┌─ 문항 1 ──────────── [🗑] ─┐        │
│  │ [질문 text input          ] │        │
│  │ ○ A [보기 A              ] │        │
│  │ ● B [보기 B (정답)       ] │        │
│  │ ○ C [보기 C              ] │        │
│  │ ○ D [보기 D              ] │        │
│  └─────────────────────────────┘        │
│                                         │
│  ┌─ 문항 2 ──────────── [🗑] ─┐        │
│  │ ...                         │        │
│  └─────────────────────────────┘        │
│                                         │
│        [ + 문항 추가 ]                  │
│                                         │
└─────────────────────────────────────────┘
```

#### step2 — validation error
- 빈 필드 있는 카드의 `border: 2px solid var(--color-danger)` + 300ms shake.
- 상단에 에러 토스트: "빈 항목을 채워주세요 (문항 3)".

#### step2 — saving
- 저장 버튼 disabled + `⟳` 아이콘. 다른 컨트롤 disabled 20% opacity.

### QuizReportModal

**공통 접근성**: QuizGenerateModal 과 동일 (Esc 닫기, focus trap, 첫 focus 는 "닫기" 버튼). 매트릭스는 가로 스크롤 발생 시 `aria-label="학생별 문항 결과 매트릭스. 가로 스크롤로 추가 문항 탐색"` 을 스크롤 컨테이너에 부여. 각 행(학생)은 `role="row"` + SR 용 첫 셀 `role="rowheader"`.

#### loading
```
┌─ 퀴즈 리포트 ────────── ✕ ─┐
│  ▢ ▢ ▢                     │
│                             │
│  ▢▢▢▢▢▢▢                   │
│  ▢▢▢▢▢▢▢                   │
│  ▢▢▢▢▢▢▢                   │
└─────────────────────────────┘
```

#### empty
```
┌─ 퀴즈 리포트 ────────── ✕ ─┐
│                             │
│      📭                     │
│   아직 제출 기록이          │
│   없습니다                  │
│                             │
│   [닫기]                    │
└─────────────────────────────┘
```

#### ready
```
┌─ 퀴즈 리포트 ──────────────────────── ✕ ─┐
│  ┌────────┐ ┌────────┐ ┌────────┐         │
│  │제출 12 │ │정답률  │ │평균    │         │
│  │ 명     │ │ 73%   │ │ 4.2초  │         │
│  └────────┘ └────────┘ └────────┘         │
│                                           │
│  ┌─────────┬─┬─┬─┬─┬─┬─┬────┐             │
│  │ 이름    │1│2│3│4│5│6│총점│             │
│  ├─────────┼─┼─┼─┼─┼─┼─┼────┤             │
│  │ 홍길동  │🟢│🔴│🟢│⚪│🟢│🟢│ 4/6│             │
│  │ 김영희  │🟢│🟢│🔴│🟢│🟢│🔴│ 4/6│             │
│  │ ...     │ │ │ │ │ │ │    │             │
│  └─────────┴─┴─┴─┴─┴─┴─┴────┘             │
│                                           │
│                     [⬇ CSV 다운로드]      │
└───────────────────────────────────────────┘
```
- 이름 컬럼 sticky left.
- 헤더 행 sticky top.
- 셀 색: `--color-status-reviewed-bg` (정답), `--color-status-returned-bg` (오답), `--color-slot-placeholder` (미응답).
- 이모지는 도식용 — 실제 구현은 `background-color` 로.

#### error
```
│  ⚠ 리포트를 불러올 수 없습니다            │
│  [다시 시도]                              │
```

### QuizCard (기존 수정)
- `status=waiting`: [참여] [편집] [삭제] 가로 정렬.
- `status=active`: [참여] 만.
- `status=finished`: [리포트 보기] [삭제]. 제출자 수 뱃지 (`N명 제출`).

## 3. 사용된 토큰

### 기존 (변경 없음)
- 색: `--color-accent`, `--color-accent-active`, `--color-accent-tinted-bg`, `--color-accent-tinted-text`, `--color-surface`, `--color-border`, `--color-text`, `--color-text-muted`, `--color-danger`, `--color-status-reviewed-bg/text`, `--color-status-returned-bg/text`, `--color-slot-placeholder`.
- 타이포: 기존 사이즈 체계 준수.
- 간격: 기존 패딩/갭 기준값.
- 보더: `--border-card`.

### 신규 (tokens_patch.json)
- `--color-quiz-difficulty-easy`: `#27a35f` (plant-active hex 재사용 — alias)
- `--color-quiz-difficulty-medium`: `#c9a227`
- `--color-quiz-difficulty-hard`: `#c62828` (danger hex alias)

> 난이도 뱃지용. QuizCard 에서 status=waiting 일 때 표시. 세그먼트 active 상태 자체는 `--color-accent` 사용.

## 4. 컴포넌트 목록

### 신규
- `src/components/quiz/QuizGenerateModal.tsx` — step 상태기 + 탭 + 옵션 폼 + draft editor + library list 조합
- `src/components/quiz/QuizDraftEditor.tsx` — 문항 카드 리스트 + 추가/삭제/저장
- `src/components/quiz/QuizReportModal.tsx` — 요약바 + 매트릭스 + CSV 버튼
- `src/components/quiz/QuizLibraryList.tsx` — 과거 퀴즈 리스트 + 페이지네이션
- `src/components/ui/SegmentedControl.tsx` — 재사용 가능 pure component (난이도 3단계)

### 수정
- `src/components/QuizBoard.tsx` — 기존 생성 폼 → QuizGenerateModal 호출로 치환. 리포트/편집 버튼 추가.

### 내부 private
- `QuizReportMatrix` (QuizReportModal.tsx 내부)
- `QuizDraftQuestionCard` (QuizDraftEditor.tsx 내부)

## 5. 반응형

| 브레이크포인트 | 동작 |
|---|---|
| 모바일 (<600px) | 모달 full-screen (inset 0, border-radius 0). 난이도 세그먼트는 한 줄 유지 가능 (3버튼). 문항 수 라디오는 세로 쌓임. 매트릭스는 가로 스크롤 + 첫 열(학생 이름) sticky. |
| 태블릿 (600~1024) | 모달 중앙 정렬, max-width 720px. 매트릭스 셀 크기 축소, 필요 시 가로 스크롤. 갤탭 S6 Lite 터치 타겟 최소 44×44px 유지. |
| 데스크탑 (≥1024) | max-width 840px (리포트) / 720px (생성). 매트릭스 가로 스크롤 없음 목표 (문항 10 × 학생 이름열 = 최소 폭). |

## 6. 구현 주의

- 난이도 뱃지 `--color-quiz-difficulty-medium` (`#c9a227` amber) 는 구현 후 실제 렌더에서 가독성(`--color-text` 흰 텍스트 대비) 확인. AA 미충족 시 `--color-accent-tinted-bg` + `--color-accent-tinted-text` 로 fallback, 신규 토큰 2개(easy/medium/hard) 는 삭제 또는 CSS `color-mix` 로 대체.
- SegmentedControl 은 프로젝트 내 최초 도입이므로 `src/components/ui/` 에 배치. 향후 다른 feature 재사용 대비.
- 문항 수 라디오는 native `<input type="radio">` + 라벨. fixed 선택 시 `<input type="number">` 동반. 복잡도 낮아 별도 컴포넌트 추출 불필요 (QuizGenerateModal 내 private).
