# Design Brief — quiz-extensions

task_id: 2026-04-15-quiz-extensions
upstream: phase3/design_doc.md

## 1. 화면/상태 목록

### Screen A — QuizGenerateModal (B2 + B3 + B4 진입)

| 상태 | 표시 정보 | 가능한 행동 |
|---|---|---|
| **step1-empty** | 탭 2개 (새로 만들기 / 과거 퀴즈). "새로 만들기" 기본. 주제 입력 placeholder, 난이도 세그먼트(쉬움/**중간**/어려움), 문항 수 모드 라디오 2개 (● **AI가 정함** / ○ 직접 지정 → 활성 시 숫자 입력 1~20, 기본 10). | 텍스트 입력, 파일 첨부, 난이도 변경, 문항 수 모드 변경(필요 시 숫자 입력), "퀴즈 생성" |
| **step1-library-empty** | "과거 퀴즈" 탭 클릭 상태. 로딩 스켈레톤 3줄. | 로딩 대기 |
| **step1-library-ready** | 교사 본인 퀴즈 리스트 (제목/생성일/문항수/학급 라벨). 페이지네이션 "더 보기". | 퀴즈 선택 (highlight) → "이 퀴즈 재사용" 버튼 활성 |
| **step1-library-no-items** | 아직 만든 퀴즈 없음 empty state ("만든 퀴즈가 없습니다"). | "새로 만들기" 탭으로 이동 |
| **step1-generating** | "생성" 버튼 클릭 직후. 로딩 스피너 + "AI가 문제를 만들고 있어요 (5~15초)". 버튼 disabled. | 취소 (모달 닫기) |
| **step1-error** | LLM 실패. 에러 메시지("생성에 실패했어요: {reason}") + "다시 시도" 버튼. | 다시 시도, 옵션 변경 후 재시도 |
| **step2-draft-ready** | 문항 카드 리스트 (N개). 각 카드: 질문 text input, 4개 보기 input, 정답 라디오, 삭제 아이콘. 하단 "+ 문항 추가" (20 상한 시 disabled) + "돌아가기" + "저장" | 편집, 추가, 삭제, 저장 |
| **step2-validation-error** | 저장 클릭 시 빈 질문/보기 있으면 해당 카드 테두리 빨강 + "빈 항목을 채워주세요" 토스트. | 수정 |
| **step2-saving** | "저장" 클릭 후. 버튼 disabled + 스피너. | 대기 |
| **step3-saved** | 성공 토스트 + 모달 닫힘. 보드의 섹션에 QuizCard 노출. | - |

### Screen B — QuizReportModal (B1)

| 상태 | 표시 정보 | 가능한 행동 |
|---|---|---|
| **loading** | 스켈레톤: 요약바 3칸 + 매트릭스 행 5개. | 취소 |
| **empty** | "아직 제출 기록 없음" 빈 상태 + 학생 수/예상 문항 수 안내. "닫기" 버튼. | 닫기 |
| **ready** | 상단 요약바 (제출 인원 / 평균 정답률 % / 평균 소요시간 초). 매트릭스(학생 행 × 문항 열, 색 셀). 하단 "CSV 다운로드" 버튼. | 다운로드, 닫기 |
| **error** | 로딩 실패 메시지 + "다시 시도". | 다시 시도 |

### Screen C — QuizCard (기존 수정)

| 상태 | 변경 |
|---|---|
| **status=waiting** | 기존 UI + "편집" 버튼 추가 (기존 "삭제" 옆) |
| **status=active** | 편집 버튼 숨김, "리포트" 버튼도 숨김 (세션 진행 중) |
| **status=finished** | "리포트 보기" 버튼 강조 노출. 제출자 수 뱃지 |

## 2. 정보 계층

### QuizGenerateModal step1
1. **주제/파일 입력** (가장 큰 비중, 상단)
2. **난이도 + 문항 수** (중간 비중, 중앙 세그먼트)
3. **생성 버튼** (CTA, 우하단)
- 과거 퀴즈 탭은 부차 진입 — 탭 UI 로 토글

### QuizGenerateModal step2
1. **문항 카드 리스트** (메인, 스크롤 영역)
2. **추가 / 저장** CTA (하단 고정)
3. **돌아가기** (step1 복귀, 텍스트 버튼)

### QuizReportModal
1. **요약 3숫자** (가장 상단, 크게 — 제출인원 / 평균정답률 / 평균시간)
2. **매트릭스** (본문 중앙, 한 화면에 들어오도록)
3. **CSV 다운로드** (우하단 보조 CTA)

### 시선 흐름
- 모달은 중앙 정렬 고정. 상단에서 하단으로 Z 패턴.
- 매트릭스는 학생 이름 고정 컬럼(왼쪽) + 가로 스크롤 문항 컬럼. 헤더 sticky.

## 3. 인터랙션 명세

### 생성 모달
- **탭 전환** (새로 만들기 ↔ 과거 퀴즈): 150ms fade.
- **난이도 세그먼트**: 클릭 시 즉시 active 상태 토글, 기존 컨트롤 `--color-accent` 배경 + 흰 텍스트.
- **문항 수 칩**: 선택 칩은 `--color-accent-tinted-bg` + `--color-accent-tinted-text`.
- **생성 버튼**: hover 시 `--color-accent-active`. disabled 조건 = 텍스트+파일 둘다 없음 OR 생성 진행 중.
- **step1 → step2**: 슬라이드 left 200ms. 돌아가기는 slide right.
- **"+ 문항 추가"**: 새 카드가 리스트 끝에 fade-in 150ms. 자동 스크롤 bottom.
- **문항 카드 삭제**: 150ms 축소 + fade-out. undo 없음 (MVP).
- **빈 필드 저장 시도**: 해당 카드 border 빨강 flash 300ms + 첫 에러 카드로 scrollIntoView.

### 리포트 모달
- **매트릭스 셀 호버**: 툴팁 노출 ("선택: B / 정답: A / 3.2초"). 200ms delay.
- **행(학생) 호버**: 해당 행 배경 hover 색.
- **CSV 다운로드 버튼**: 클릭 시 spinner 500ms 후 브라우저 download. 완료 후 토스트 "리포트 다운로드 완료".

### QuizCard
- **"리포트 보기" 클릭**: 모달 오픈 (기존 모달 전환 패턴 사용).
- **"편집" 클릭**: QuizGenerateModal step2 로 직행 (기존 questions 주입).

## 4. 접근성 요구

1. **키보드 only 동작**: 모달 열릴 때 focus trap. Tab 순서 = 탭 → 입력 → 옵션 → 생성. Esc 로 닫기. 매트릭스 셀은 tabindex 순회 + Enter 로 툴팁 토글.
2. **스크린리더 라벨**:
   - 세그먼트: `<div role="radiogroup" aria-label="난이도">` + 각 버튼 `role="radio" aria-checked`.
   - 칩: 동일 패턴으로 radiogroup + radio.
   - 매트릭스 셀: `aria-label="홍길동 - 1번 문항: 정답, 2.1초"` 포맷.
   - 정답 라디오: `aria-label="정답: A/B/C/D"`.
3. **명도 대비**: 매트릭스 셀 색은 기존 상태 토큰 (`--color-status-reviewed-*` = 녹색, `--color-status-returned-*` = 빨강, `--color-slot-placeholder` = 회색) 재사용 — 이미 AA 통과 확인됨.
4. **포커스 가시성**: 모든 interactive 요소 focus 시 `outline: 2px solid var(--color-accent-tinted-text); outline-offset: 2px`.
5. **폼 에러 aria**: 빈 필드 에러는 `aria-invalid="true"` + `aria-describedby` 로 에러 메시지 연결.

## 5. 디자인 시스템 확장 여부

### 기존 토큰으로 충분
- 정답/오답/미응답 매트릭스 셀: `--color-status-reviewed-*` / `--color-status-returned-*` / `--color-slot-placeholder` (assignment-board 에서 도입). 시맨틱 매핑:
  - 정답 = reviewed (확인됨 녹색)
  - 오답 = returned (반려 빨강)
  - 미응답 = slot-placeholder (회색)
- CTA: `--color-accent` / `--color-accent-active`
- 세그먼트/칩 active: `--color-accent-tinted-bg` + `--color-accent-tinted-text`
- 모달/카드: `--color-surface` + `--border-card`

### 신규 토큰 (최소)
- `--color-quiz-difficulty-easy`: `#27a35f` (plant-active 재사용)
- `--color-quiz-difficulty-medium`: `#c9a227` (새 — 노랑/amber. 기존 토큰에 amber 없음)
- `--color-quiz-difficulty-hard`: `#c62828` (danger 재사용)

> 난이도 뱃지(QuizCard 에서 리포트 열 때 표시) 용도. 세그먼트 자체 active 색은 기존 accent 사용. 후순위로 미루면 뱃지에 아이콘만 쓰고 색은 액센트로 통일 가능 → phase6 검수에서 결정.

### 신규 컴포넌트
- `SegmentedControl` (기존 없으면 필요). 검색해보니 난이도 세그먼트는 현 프로젝트 최초. 재사용 가능한 pure component 로 작성 (`options: Array<{value, label}>`, `value`, `onChange`).
- `ChipGroup` (문항 수 선택용 — SegmentedControl 과 시각 차별화 위해 chip 스타일 별도).
- `MatrixCell` (리포트 전용 — 단일 파일 내 private 컴포넌트로 충분, 전역 등록 불필요).
