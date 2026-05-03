# design_spec.md — before/after (phase6 수정)

phase5 원본 vs. phase6 수정본 차이.

## 추가 섹션

1. **QuizGenerateModal "공통 접근성" 블록** — Esc/focus trap/탭 스타일.
2. **QuizReportModal "공통 접근성" 블록** — 매트릭스 aria-label / rowheader.
3. **섹션 5 반응형 표** — 모바일/태블릿/데스크탑 동작.
4. **섹션 6 구현 주의** — medium 색 fallback 경로, SegmentedControl/ChipGroup 배치.

## 변경 없음

- 선택 변형 (v1 Stacked) 유지.
- 화면 ASCII 도식 (step1/step2/report) 유지.
- 컴포넌트 목록 (신규 6개 + 수정 1개) 유지.
- tokens_patch.json 변경 없음 (단 구현 단계 fallback 명시됨).

## 채점 반영

- 접근성 8 → 9
- 계층 8 → 9 (탭 강조 명시)
- 반응형 8 → 9 (breakpoint 섹션)
- 평균 8.5 → 9.0 → phase7 진행 가능.
