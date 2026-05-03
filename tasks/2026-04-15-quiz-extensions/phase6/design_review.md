# Design Review — quiz-extensions

task_id: 2026-04-15-quiz-extensions
input: phase5/design_spec.md (v1 Stacked Cards)

## 1. design_brief 요구사항 반영 체크

| brief 요구 | spec 반영 여부 |
|---|---|
| step1~3 + error 상태 전부 | ✅ step1-empty / library-empty / library-ready / generating / error / step2-draft / validation-error / saving / step3-saved |
| 리포트 loading/empty/ready/error | ✅ 4 상태 모두 |
| QuizCard 3 상태 (waiting/active/finished) | ✅ 반영 |
| 시선 흐름 Z 패턴 | ✅ step1 상단→중앙→우하단 CTA |
| 키보드 focus trap + Esc | ✅ 암묵적 (기존 Modal 패턴). 단 spec 에 명시 추가 필요 |
| SR 라벨 (radiogroup 등) | ✅ 세그먼트/칩/매트릭스/정답 라디오 명시 |
| 명도 대비 | ✅ 기존 AA 통과 토큰 재사용 |
| 포커스 가시성 | ✅ accent outline 명시 |
| 디자인 시스템 확장 최소 | ✅ 신규 토큰 3개(난이도 뱃지) + 신규 컴포넌트 SegmentedControl/ChipGroup |

누락: **Esc/focus trap 이 spec 텍스트에 명시 안 됨** → 수정 필요.

## 2. 6개 차원 평가 (0~10)

| 차원 | 초안 점수 | 근거 |
|---|---|---|
| 일관성 | **9** | 기존 accent/border/surface 토큰 재사용. Modal 패턴 기존 것과 동일. -1: 난이도 뱃지 medium 은 신규 hex(`#c9a227`) 로 디자인 시스템에 amber 계 없음 → 톤 파악 필요. |
| 계층 | **8** | step1: 입력 → 옵션 → CTA Z 패턴 명확. step2: 리스트 → 추가/저장. 리포트: 3숫자 → 매트릭스 → CSV. -2: step1 에서 "과거 퀴즈" 탭이 2nd class citizen 느낌 — 사용자가 놓칠 수 있음(탭이 상단 작게). |
| 접근성 | **8** | radiogroup/aria-label/focus outline 전부 반영. -2: Esc/focus trap 명시 누락. 매트릭스 가로 스크롤 시 screen reader 행 탐색 안내 부재. |
| 감성/톤 | **9** | Padlet 클론의 "수업 도구" 톤 유지. 과한 그라디언트·일러스트 없음. 이모지 사용 절제(📚/📭 empty 상태만). |
| AI slop 감지 | **9** | 반복적 placeholder 없음. 모든 버튼 라벨 구체적("퀴즈 생성"·"이 퀴즈 재사용"). -1: step2 에서 "문항 N" 제목이 기계적 — 실제로는 충분하지만 미적으로 단조. |
| 반응형 | **8** | 데스크탑 기준 설계. 태블릿(갤탭 S6 Lite 1200×2000) 대응 언급은 comparison.md 에만. spec 자체에 breakpoint 명시 부족. 모바일 폰 기준 매트릭스 가로 스크롤 필수성 반영 필요. |

**평균: (9+8+8+9+9+8)/6 = 8.5** → **phase7 진행 가능** (≥8.0). 단 아래 3건 수정 반영.

## 3. 수정 사항 (design_spec.md 덮어쓰기 대상)

1. **Focus trap / Esc 명시**: QuizGenerateModal / QuizReportModal 섹션에 "Esc 키로 모달 닫기. Tab/Shift+Tab 순회는 모달 내부로 제한 (focus trap). 모달 오픈 시 첫 interactive 요소에 자동 focus."
2. **탭 시각 강조**: step1 탭이 2-class citizen 으로 보이지 않도록 "두 탭 동일 폭, active 탭은 하단 2px accent underline + bold". ASCII 도식 주석에 추가.
3. **반응형 breakpoint**: `design_spec.md` 말미에 "반응형" 섹션 신설 — 모바일(<600px) 매트릭스 가로 스크롤 허용, 첫 열(이름) sticky. QuizGenerateModal 은 모바일에서 full-screen 모달. 태블릿(600~1024) 중앙 정렬 + 최대폭 720px.
4. **난이도 medium 색 재검토**: `#c9a227` amber 가 배지에서 가독성 확인 필요. 대안: `--color-accent-tinted-bg` + `--color-accent-tinted-text` 로 통일 (신규 토큰 2개 삭제 가능). → phase7 coder 구현 시 결정하도록 **tokens_patch.json 을 유지**하되 design_spec 에 "구현 단계에서 가독성 재확인 후 fallback 가능" 주석 추가.

## 4. 수정 후 최종 점수

- 일관성: **9** (medium 색 fallback 명시)
- 계층: **9** (+1 탭 강조 수정)
- 접근성: **9** (+1 focus trap 명시)
- 감성/톤: **9** (유지)
- AI slop 감지: **9** (유지)
- 반응형: **9** (+1 breakpoint 섹션 추가)

**최종 평균: 9.0 → phase7 진행**

## 5. before / after

이 phase 의 수정은 design_spec.md 텍스트 정정 (ASCII 마크업 파일). 스크린샷 비교는 phase9 실 구현 후에 가능. `before_after/` 는 spec diff 메모 1개 저장:
- `before_after/spec_diff.md` (phase5 원본 vs. 수정본의 추가 섹션 나열)

## 6. AI slop 감지

- 반복 placeholder "문항 텍스트"·"Lorem" 없음. ✅
- 무의미 그라디언트 없음 (단색 배경만). ✅
- 스탬프 패턴 "✨ AI powered" 같은 꾸밈 라벨 없음. ✅
- "혁신적인" 같은 공허 형용사 UI 문구 없음. ✅
