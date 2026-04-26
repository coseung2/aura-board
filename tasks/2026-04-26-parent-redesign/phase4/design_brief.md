# Design Brief — parent-redesign

## 1. 화면 / 상태 매트릭스

### A. `/parent/auth` (OAuth + 매직링크 fallback)

| 상태 | 표시 | 행동 |
|---|---|---|
| ready (default) | OAuth 버튼 2개(Google·Kakao) + "이메일 링크로 로그인" 보조 | OAuth 버튼 → /api/parent/auth/{provider} |
| OAuth in progress | 버튼 spinner + "{provider} 로그인 중…" | 대기 |
| state 에러 | 빨간 배너 "로그인 다시 시도해 주세요" + 다시 시도 버튼 | 재시도 → /parent/auth |
| provider 에러 | "Google/Kakao 응답 오류 — 잠시 후 다시 시도" | 재시도 |
| dev env 미설정 | OAuth 버튼 disabled + 노란 배너 "OAuth 환경변수 미설정 — 매직링크로 진행" | 매직링크 진입 |

### B. `/parent/(app)/home` (대시보드)

| 상태 | 표시 | 행동 |
|---|---|---|
| empty (자녀 0명) | 헤더 "환영합니다" + 본문 "자녀를 연동해주세요" CTA | "자녀 연동하기" → /parent/onboard/match/code |
| ready (자녀 1명) | 헤더: 자녀 chip([김민수 (3-1)]) + 우측 [🌟 자랑해요] [+ 자녀 추가] / 본문: ParentPortfolioView | chip 클릭 무반응 (1명), 액션 버튼 클릭 |
| ready (자녀 ≥2명) | 헤더 chip 우측에 ▼ / 본문: 선택 자녀 portfolio | chip → dropdown → 자녀 선택 → 본문 갱신 (URL ?child=ID) |
| loading | skeleton 헤더 + 그리드 | 대기 |
| 자녀 link pending | "교사 승인 대기 중" 안내 카드 + portfolio 빈 상태 | 새로고침 버튼 |

### C. `/parent/(app)/showcase` (자랑해요 그리드)

| 상태 | 표시 | 행동 |
|---|---|---|
| ready | 헤더 ← + 🌟 우리 학급 자랑해요 + 학급명 / 그리드 카드 | chip 클릭 → 모달 (PortfolioCardModal) |
| empty | "📭 아직 자랑해요에 올라온 작품이 없어요" | — |

## 2. 정보 계층

### `/parent/auth`
1. 가장 큰 OAuth 버튼 2개 (Google + Kakao)
2. 보조 매직링크 input
3. 안내 문구 (자녀 코드 안내)

### `/parent/home` (대시보드)
1. 자녀 셀렉터 chip — 누구의 활동을 보는지 즉시 인지
2. 본문 portfolio (자녀 카드 + 학급 자랑해요)
3. 헤더 우측 액션 (자랑해요 진입, 자녀 추가)

## 3. 인터랙션

- **자녀 셀렉터 chip**: 자녀 1명 = 정적 chip (드롭다운 X), ≥2명 = 클릭 시 dropdown menu (`role="listbox"`). 선택 시 URL `?child=ID` 갱신.
- **자녀 추가 버튼**: 헤더 우측 또는 dropdown 끝. 클릭 → /parent/onboard/match/code.
- **OAuth 버튼**: 클릭 → POST. provider state 발급 후 외부 redirect. 외부 인증 후 자동 복귀.

## 4. 접근성 (≥3)

1. **OAuth 버튼**: `aria-label="Google 로 로그인"` / `aria-label="Kakao 로 로그인"`. brand 컬러 + 충분한 contrast (WCAG AA).
2. **자녀 셀렉터**: `aria-haspopup="listbox"`, `aria-expanded`. 키보드 ↑/↓로 자녀 순회, Enter 선택, ESC 닫기.
3. **5탭 redirect 페이지**: 메시지 1초 노출 후 자동 redirect. `aria-live="polite"` 안내.
4. **포커스 가시성**: 모든 OAuth 버튼·셀렉터 chip·dropdown 항목 `outline: 2px solid var(--color-accent-tinted-text)`.
5. **터치 타겟**: OAuth 버튼 height ≥44px, dropdown 항목 ≥44px.

## 5. 디자인 시스템 확장

### 신규 토큰 (2)

| 토큰 | 값 | 용도 |
|---|---|---|
| `--color-oauth-google` | `#4285F4` | Google OAuth 버튼 강조 |
| `--color-oauth-kakao` | `#FEE500` | Kakao OAuth 버튼 brand 색 |

> 실제 OAuth 버튼은 brand guideline 따라 white background + brand 색 글자/아이콘.

### 컴포넌트
- `<ParentAuthButtons />` — OAuth 버튼 row + 매직링크 보조
- `<ParentChildSelector />` — chip + dropdown
- `<ParentDashboard />` — 풀폭 헤더 + 본문
- (재사용) `<ParentPortfolioView />`, `<ShowcaseGalleryView />`
