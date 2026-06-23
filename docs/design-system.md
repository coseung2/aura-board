# Aura Board Design System

Notion-inspired. 모든 신규 기능/탭은 이 문서의 토큰과 패턴을 따른다.
웹 `src/styles/base.css`가 source of truth이며, 모바일은
`apps/mobile/theme/tokens.ts`로만 포팅한다. 화면 컴포넌트에서 임의 hex,
radius, shadow 값을 새로 만들지 않는다.

---

## 1. 컬러 토큰

소스: `src/styles/base.css`

### 배경/표면

| 토큰 | 값 | 용도 |
|---|---|---|
| `--color-bg` | `#ffffff` | 페이지 캔버스 |
| `--color-bg-alt` | `#ffffff` | 헤더, 특수 영역 |
| `--color-surface` | `#ffffff` | 카드/모달/컨테이너 |
| `--color-surface-alt` | `rgba(24, 74, 92, 0.07)` | 서브 표면 (user-switcher 배경 등) |

### 텍스트

| 토큰 | 값 | 용도 |
|---|---|---|
| `--color-text` | `#18313f` | 제목, 본문 |
| `--color-text-muted` | `#5d6f76` | 설명, 라벨, 보조 텍스트 |
| `--color-text-faint` | `#8fa0a6` | 캡션, placeholder, 비활성 |

### 액센트

| 토큰 | 값 | 용도 |
|---|---|---|
| `--color-accent` | `#1683c7` | CTA 버튼, 링크 |
| `--color-accent-active` | `#0d679f` | hover/pressed 상태 |
| `--color-accent-tinted-bg` | `#e9f7ff` | 뱃지 배경 |
| `--color-accent-tinted-text` | `#0f70ad` | 뱃지 텍스트, focus outline |

### 보더

| 토큰 | 값 | 용도 |
|---|---|---|
| `--color-border` | `rgba(24, 74, 92, 0.14)` | 기본 구분선 |
| `--color-border-hover` | `rgba(24, 74, 92, 0.23)` | hover 시 강조 |

### Plant-roadmap (PJ-1~6, 추가 2026-04-12)

| 토큰 | 값 | 용도 |
|---|---|---|
| `--color-plant-active` | `#27a35f` | 현재 진행 단계 노드 강조 |
| `--color-plant-visited` | `#b8dfc7` | 완료 단계 노드/연결선 |
| `--color-plant-upcoming` | `#d0cfcd` | 미래 단계 노드 보더 (dashed) |
| `--color-plant-stalled` | `#c62828` | 7일+ 무활동 경고 뱃지 (returned 색 alias) |

### Destructive (section-actions-panel, 추가 2026-04-13)

| 토큰 | 값 | 용도 |
|---|---|---|
| `--color-danger` | `#c62828` | 파괴적 액션 버튼 배경 (섹션 삭제 등) |
| `--color-danger-active` | `#a01b1b` | 위 hover/active |

> `--color-danger` 와 `--color-plant-stalled` 는 현재 동일 hex 이나 의미가 달라 별도 토큰.

### Vibe-arcade (Seed 13, 추가 2026-04-20)

| 토큰 | 값 | 용도 |
|---|---|---|
| `--color-vibe-rating` | `#f5a623` | 별점 채움 amber(itch.io/Steam 관례) |
| `--color-vibe-rating-empty` | `#e5e5e5` | 빈 별 윤곽 |
| `--color-vibe-quota-ok` | `var(--color-plant-active)` | 쿼터 게이지 정상 (>20%) |
| `--color-vibe-quota-warn` | `#f5a623` | 쿼터 경고 (5-20%, 장식 용도) |
| `--color-vibe-quota-danger` | `var(--color-danger)` | 쿼터 소진 임박 (<5%) |
| `--color-vibe-sandbox-bg` | `#1a1a1a` | 플레이 모달 몰입 배경 (v3 Arcade Dark 차용) |
| `--color-vibe-chat-user-bg` | `var(--color-accent-tinted-bg)` | Studio 사용자 메시지 배경 |

> alias 3건 (quota-ok · quota-danger · chat-user-bg) — 의미 분리하되 물리적 hex 중복 회피. 순신규 4개는 별점/쿼터 경고/샌드박스 배경 한정.
> 승인 배지·반려 배너·pending 상태 등은 기존 `--color-status-*` 재활용 (VibeProject moderationStatus pill · 리뷰 신고 배너).

### 시맨틱 상태색 (assignment-board, AB-1 · 2026-04-14)

과제 게시판 상태 뱃지/배너를 위한 bg+text 쌍 토큰. 모두 WCAG AA 이상.

| 토큰 | 값 | 용도 |
|---|---|---|
| `--color-status-submitted-bg` | `#f2f9ff` | 제출 완료 뱃지 배경 |
| `--color-status-submitted-text` | `#1565c0` | 제출 완료 뱃지 텍스트 |
| `--color-status-reviewed-bg` | `#e8f5e9` | 확인됨 뱃지 배경 |
| `--color-status-reviewed-text` | `#2e7d32` | 확인됨 뱃지 텍스트 |
| `--color-status-returned-bg` | `#ffebee` | 반려 뱃지 / 학생 재진입 배너 배경 |
| `--color-status-returned-text` | `#c62828` | 반려 뱃지 텍스트 (`--color-danger` 와 동일 hex, 시맨틱 분리) |
| `--color-slot-placeholder` | `var(--color-surface-alt)` | 미제출 slot 썸네일 회색 placeholder (alias) |

예외: 모달 내부 버튼 radius는 `6px` (기본 `--radius-btn: 4px`에서 이탈) — 풀스크린 모달 UX 밸런스상 AB-1에서만 허용.

> **규칙**: 신규 컴포넌트에서 하드코딩 hex 금지. 반드시 `var(--color-*)` 토큰 사용. 시맨틱 상태색만 예외.

---

## 2. 타이포그래피

### 폰트 스택

```css
--font-display: "Pretendard Variable", "SUIT", "Noto Sans KR", "Segoe UI", sans-serif;
--font-body: "Pretendard Variable", "SUIT", "Noto Sans KR", "Segoe UI", sans-serif;
--font-display-tracking: 0;
```

### 사이즈 체계

| 레벨 | size | weight | letter-spacing | 용도 |
|---|---|---|---|---|
| Display | 26px | 700 | -0.5px | 보드 제목 |
| Title | 20px | 700 | -0.3px | 모달 제목 |
| Subtitle | 16px | 700 | -0.25px | 카드 제목 |
| Section | 15px | 700 | -0.15px | 컬럼 헤더 |
| Body | 14–15px | 400 | normal | 본문, 입력 필드 |
| Label | 13px | 600 | normal | UI 라벨 |
| Badge | 12px | 600–700 | 0.125px | 뱃지, 캡션 |
| Micro | 11px | 600 | 0.1px | 카운트, 보조 |

### 본문 기본값

```css
font-family: var(--font-body);
font-size: 15px;
font-weight: 400;
line-height: 1.5;
-webkit-font-smoothing: antialiased;
font-feature-settings: "kern", "liga";
```

> **규칙**: 신규 텍스트는 위 8단계 중 하나에 매핑. 임의 사이즈 금지.

---

## 3. 간격 & 반경

### Border Radius

| 토큰 | 값 | 용도 |
|---|---|---|
| `--radius-card` | `16px` | 카드, 컨테이너, 모달 |
| `--radius-btn` | `10px` | 버튼 |
| `--radius-control` | `12px` | 인풋, 컨트롤 |
| `--radius-pill` | `9999px` | 뱃지, 스위처, FAB |

### 패딩 기준값

| 요소 | Desktop | 1080px | 768px | 560px |
|---|---|---|---|---|
| 헤더 | 18px 32px | 16px 24px | 14px 18px | 12px 14px |
| 캔버스 | 32px | 24px | 18px | 18px |
| 카드 (드래그) | 16px 18px 18px | — | — | 14px 16px 16px |
| 카드 (그리드) | 20px | — | — | — |
| 모달 헤더 | 20px 24px | — | — | — |
| 모달 바디 | 16px 24px 24px | — | — | — |

### 갭 기준값

| 레이아웃 | 값 |
|---|---|
| Grid 카드 간 | 20px |
| Stream 카드 간 | 16px |
| Column 간 | 24px |
| Column 내 카드 간 | 12px |

---

## 4. 그림자

| 토큰 | 값 | 용도 |
|---|---|---|
| `--shadow-card` | 2-layer soft blue-gray | 카드 기본 |
| `--shadow-card-hover` | stronger 2-layer soft blue-gray | 카드 hover |
| `--shadow-lift` | `rgba(24,74,92,0.09) 0 3px 10px` | 활성 상태 (스위처 등) |
| `--shadow-accent` | `0 8px 20px rgba(22,131,199,0.22)` | CTA 버튼 |
| `--shadow-accent-hover` | `0 10px 24px rgba(22,131,199,0.28)` | CTA hover |

```css
/* --shadow-card 전체 값 */
rgba(24, 74, 92, 0.08) 0px 10px 28px,
rgba(24, 74, 92, 0.04) 0px 2px 8px;
```

> **규칙**: 신규 그림자 추가 금지. 위 5개 토큰 중 선택. 모달은 별도 `box-shadow` 허용 (overlay 위 요소).

---

## 5. 보더

```css
--border-card: 1px solid var(--color-border);
```

- 기본: whisper-weight `1px solid rgba(0,0,0,0.1)`
- hover: `--color-border-hover` (`rgba(0,0,0,0.15)`)
- 2px 이상 보더 금지 (시맨틱 상태색 제외)

---

## 6. 반응형 브레이크포인트

소스: `src/styles/responsive.css`

| 이름 | 조건 | 주요 변화 |
|---|---|---|
| Desktop | 기본 | 전체 레이아웃 |
| Tablet | `max-width: 1080px` | 패딩 축소 |
| Mobile-L | `max-width: 768px` | 타이틀 22px, 캔버스 스크롤 허용 |
| Mobile-S | `max-width: 560px` | 타이틀 20px, 아이콘 전용, 폼 full-width |

---

## 7. 컴포넌트 패턴

### 카드 (필수 패턴)

모든 카드 컴포넌트는 이 베이스를 따른다:

```css
background: var(--color-surface);
border: var(--border-card);
border-radius: var(--radius-card);
box-shadow: var(--shadow-card);
transition: box-shadow 180ms ease, border-color 180ms ease;
```

hover 시:
```css
box-shadow: var(--shadow-card-hover);
border-color: var(--color-border-hover);
```
### Container Discipline

Do not use an extra box, card, or panel as the default way to group UI.
Prefer boxless hierarchy first: spacing, alignment, dividers, typography,
icons, inline actions, underlined tabs, subtle color/state changes, or layout
grouping.

Use bordered or filled containers only when the element is a truly independent
object, such as a repeated card, modal, form surface, or tool panel.

In particular, header actions, status labels, simple metadata, filters, tabs,
group selectors, and small control clusters should usually stay inline or use
lightweight separators instead of becoming nested cards or boxed panels.

### 버튼

| 타입 | 배경 | 텍스트 | 반경 | 그림자 |
|---|---|---|---|---|
| Primary (CTA) | `--color-accent` | `#ffffff` | `--radius-btn` 또는 `50%` (FAB) | `--shadow-accent` |
| Secondary | `transparent` | `--color-text-muted` | `--radius-btn` | 없음 |
| Destructive | `rgba(0,0,0,0.06)` → hover `#fee` | `--color-text-muted` → hover `#c62828` | `--radius-pill` | 없음 |

### 모달

```css
background: var(--color-surface);
border: var(--border-card);
border-radius: var(--radius-card);
box-shadow: 0 24px 80px rgba(0,0,0,0.18), 0 8px 24px rgba(0,0,0,0.1);
animation: modalIn 200ms ease;
```

### SidePanel (우측 슬라이드 시트, 추가 2026-04-13)

범용 우측 슬라이드 시트 프리미티브. `src/components/ui/SidePanel.tsx`. 데스크탑(>=768px)에서는 우측 고정 420px, 모바일(<768px)에서는 바텀시트(max-height 85vh).

```css
.side-panel {
  position: fixed; top: 0; right: 0; bottom: 0;
  width: 420px;
  background: var(--color-surface);
  box-shadow: -8px 0 24px rgba(0,0,0,0.08), var(--shadow-card);
  transform: translateX(0);
  transition: transform 250ms ease-out;
}
```

필수 a11y: `role=dialog` + `aria-modal=true` + `aria-labelledby` + ESC 닫기 + focus trap(Tab/Shift+Tab) + body scroll lock + opener 포커스 복귀. `@media (prefers-reduced-motion: reduce)` 에서 transition 제거.

소비처:
- `SectionActionsPanel` (columns 보드 섹션 관리 — 이름 변경 / 삭제 2탭)
- `BoardSettingsPanel` (보드 헤더 ⚙ — 브레이크아웃 + 준비 중 3탭, 2026-04-13)
- `plant/StageDetailSheet` (관찰 기록 상세)

### 인풋/텍스트에어리어

```css
font-size: 14px;
padding: 10px 14px;
border: 1px solid var(--color-border);
border-radius: 8px;
background: var(--color-bg);
/* focus */
border-color: var(--color-accent);
```

### 라이브 임베드 wrapper (`.card-canva-embed`)

카드 안에서 외부 도구의 iframe 을 라이브로 렌더할 때 쓰는 반응형 16:9 박스.
썸네일이 iframe 로드 전 LCP 를 선점하고, 로드 완료 시 opacity 페이드로 교체된다.

```css
.card-canva-embed {
  position: relative;
  width: 100%;
  padding-bottom: 56.25%;   /* 16:9 */
  min-height: 90px;         /* tiny-card floor */
  background: var(--color-bg);
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 8px;
}
.card-canva-embed > img,
.card-canva-embed > iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
.card-canva-embed > img { object-fit: cover; transition: opacity 150ms ease; }
.card-canva-embed[data-loaded="true"] > img { opacity: 0; pointer-events: none; }

@media (prefers-reduced-motion: reduce) {
  .card-canva-embed > img { transition: none; }
}
```

적용 규칙:
- React가 iframe `onLoad` 에서 wrapper 에 `data-loaded="true"` 를 부여 → CSS 가 썸네일을 페이드 아웃.
- iframe 은 `sandbox="allow-scripts allow-same-origin allow-popups"` + `loading="lazy"` 고정.
- `frame-src` 를 허용하지 않은 출처는 브라우저가 차단 — 허용 출처는 `next.config.ts` 의 CSP allowlist 로 관리 (현재: `'self' https://www.canva.com https://www.youtube.com`).
- 향후 Figma / Notion / GeoGebra 등이 합류하면 이 규칙을 `.card-live-embed` 로 일반화하는 리팩터가 예정됨.

### 뱃지/필

```css
font-size: 12px;
font-weight: 600–700;
color: var(--color-accent-tinted-text);
background: var(--color-accent-tinted-bg);
padding: 2px 8px;
border-radius: var(--radius-pill);
```

---

## 8. 접근성

| 항목 | 규칙 |
|---|---|
| Focus | `:focus-visible` — `2px solid #097fe8`, offset `2px` |
| 터치 타깃 | 최소 24px (권장 32px+) |
| 키보드 | 삭제 버튼은 `:focus-within`에서도 표시 |
| 대비 | Primary 텍스트 ~18:1, Secondary ~5.5:1, Accent ~4.6:1 (AA) |

---

## 9. 트랜지션

| 속성 | 지속시간 | 이징 |
|---|---|---|
| box-shadow, border-color | 180ms | ease |
| background, color | 150–160ms | ease |
| transform (hover lift) | 160ms | ease |
| 모달 진입 | 200ms | ease |

> **규칙**: `transform`에 transition 걸지 않는다 — dnd-kit이 매 프레임 갱신하므로 lag 발생.

---

## 9½. Design System Tooling

### Component Catalog (`/design`)

모든 `ds-*` utility class와 디자인 토큰을 한 화면에서 보여주는 갤러리 페이지입니다.

```
Route: /design (public, no auth)
Source: src/app/design/page.tsx
```

### Compliance Checker (`npm run ds:check`)

`src/styles/` 에서 `base.css` 외부의 하드코딩 hex color를 검사합니다.

```bash
npm run ds:check
```

검출된 hex는 `var(--color-*)` 토큰으로 교체.

### 버튼 시스템

표준 버튼은 `src/styles/ds-utils.css` 에 단일 정의:

| 클래스 | 용도 |
|--------|------|
| `.ds-btn-primary` | CTA 버튼 |
| `.ds-btn-secondary` | 보조 버튼 |
| `:disabled` | 두 버튼 모두 opacity 0.5 + pointer-events: none |

버튼 클래스는 `ds-utils.css`에만 정의되어 있어야 함. 타 CSS 파일(`drawing.css` 등)에서 중복 정의 금지.

---

## 10. CSS 파일 구조

```
src/styles/
├── base.css          # 토큰 정의, 리셋, :focus-visible
├── layout.css        # 페이지 구조, 헤더, 캔버스
├── card.css          # 카드 공통, 첨부파일, 링크 프리뷰
├── modal.css         # 모달, 폼, 파일 업로드
├── boards.css        # Grid, Stream, Columns 레이아웃
├── assignment.css    # 과제 보드
├── home.css          # 대시보드, 보드 리스트
├── user-switcher.css # RBAC 스위처
├── export.css        # 내보내기, Canva 연동
├── misc.css          # FAB, 컨텍스트 메뉴
├── auth.css          # 로그인, 인증 헤더
├── quiz.css          # 퀴즈 보드
└── responsive.css    # 브레이크포인트
```

> **규칙**: 신규 탭/보드 추가 시 `src/styles/{board-name}.css` 파일을 만들고, 토큰은 `base.css`에서만 참조. 토큰 추가가 필요하면 `base.css`의 `:root`에 추가하고 이 문서도 갱신.

---

## 11. 신규 기능 체크리스트

새 탭/보드/컴포넌트를 만들 때 반드시 확인:

- [ ] 모든 색상이 `var(--color-*)` 토큰 사용 (시맨틱 상태색 제외)
- [ ] 타이포는 8단계 체계 중 하나에 매핑
- [ ] 카드류 컴포넌트는 카드 패턴(surface + border + shadow + hover) 준수
- [ ] border-radius는 3개 토큰 중 하나 사용
- [ ] 그림자는 5개 토큰 중 하나 사용
- [ ] 반응형 3 브레이크포인트 대응
- [ ] `:focus-visible` 스타일 자동 적용 확인
- [ ] 터치 타깃 최소 24px
- [ ] `transform`에 transition 없음
- [ ] CSS 파일은 `src/styles/`에 분리, `base.css` import
