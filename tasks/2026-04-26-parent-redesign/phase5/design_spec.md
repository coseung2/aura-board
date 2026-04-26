# Design Spec — parent-redesign

## 1. 선택된 변형

shotgun 4 variants 비교 in [mockups/comparison.md](mockups/comparison.md). v1 (DJ 보드 헤더 패턴 일관) 채택. v2/v3/v4 [rejected/](rejected/) 보존.

## 2. 화면별 최종 디자인

### A. `/parent/auth` — 로그인 화면

```
┌──────────────────────────────────────┐
│            👨‍👩‍👧 학부모 로그인            │
├──────────────────────────────────────┤
│                                      │
│  ┌────────────────────────────┐    │
│  │  [G] Google로 로그인        │    │
│  └────────────────────────────┘    │
│                                      │
│  ┌────────────────────────────┐    │
│  │  [말풍선] Kakao로 로그인     │    │
│  └────────────────────────────┘    │
│                                      │
│  또는                                 │
│                                      │
│  ┌────────────────────────────┐    │
│  │  이메일 입력 [____________]  │    │
│  │  [매직링크로 로그인]         │    │
│  └────────────────────────────┘    │
│                                      │
│  자녀 학급 초대코드는 로그인 후 입력 │
└──────────────────────────────────────┘
```

치수:
- OAuth 버튼: width 100%, height 48px
- Google 색: white bg + Google brand color icon
- Kakao 색: `#FEE500` bg + black text + Kakao 말풍선 icon

### B. `/parent/(app)/home` — 대시보드

```
┌────────────────────────────────────────────────────────────────┐
│ [김민수 (3-1) ▼]              [🌟 자랑해요] [+ 자녀 추가] [👤] │
├────────────────────────────────────────────────────────────────┤
│  📚 김민수의 작품 (4개)                                         │
│                                                                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                    │
│  │  카드 1  │  │  카드 2  │  │  카드 3  │  ...                │
│  └──────────┘  └──────────┘  └──────────┘                    │
│                                                                │
│  🌟 우리 학급 자랑해요 (3개)                                    │
│                                                                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                    │
│  │ chip 1   │  │ chip 2   │  │ chip 3   │                    │
│  └──────────┘  └──────────┘  └──────────┘                    │
└────────────────────────────────────────────────────────────────┘
```

자녀 ≥2명 시 chip dropdown:
```
┌────────────────────────┐
│ 🟢 김민수 (3-1) — 4개  │  ← 선택됨
│    김지호 (5-2) — 7개  │
│    김예린 (1-3) — 2개  │
│ ────────────────────  │
│ + 자녀 추가             │
└────────────────────────┘
```

### C. `/parent/(app)/showcase`

`/student/showcase` 패턴 그대로 (DJ 헤더 + grid). 학부모는 자녀 학급의 자랑해요만 노출 (학생들 별도 학급은 leak 0).

## 3. 사용된 토큰

### 기존 재사용
- 헤더: `--color-bg-alt`, `--color-border`, `--color-text` — DJ 헤더 패턴
- 카드 모달: `--color-surface`, `--color-showcase` (자랑해요 amber)
- portfolio grid: 기존 [src/styles/portfolio.css](../../../src/styles/portfolio.css) 의 `.portfolio-grid`, `.portfolio-card-modal-*` 등

### 신규 (2)
| 토큰 | 값 | 용도 |
|---|---|---|
| `--color-oauth-google` | `#4285F4` | Google OAuth 버튼 |
| `--color-oauth-kakao` | `#FEE500` | Kakao OAuth 버튼 |

> brand guideline 따라 둘 다 white background + brand 색 strip.

## 4. 컴포넌트 목록

### 신규 (4)
- `<ParentAuthButtons />` — OAuth row + 매직링크 fallback
- `<ParentChildSelector />` — chip dropdown
- `<ParentDashboard />` — 헤더 + 본문 컨테이너
- `<ShowcaseGalleryView />` 의 부모 페이지 (`/parent/(app)/showcase/page.tsx`)

### 재사용 (4)
- `<ParentPortfolioView />` — 자녀 카드 + 자랑해요 통합 (이미 존재)
- `<ShowcaseGalleryView />` — student-portfolio task 자산
- `<PortfolioCardModal />` — 카드 클릭 in-place view
- `<ShowcaseCardChip />` — 자랑해요 chip

### 삭제 (1)
- `<ChildTabs />` — 6탭 → 0
