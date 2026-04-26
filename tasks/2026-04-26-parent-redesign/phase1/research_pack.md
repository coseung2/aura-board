# Phase 1 — Research Pack (parent-redesign)

## 조사 범위

| 축 | 우리 요구 | 1차 조사 |
|---|---|---|
| OAuth 인증 | Google + Kakao 1차 동시 출시 + 기존 매직링크 학부모 자동 link | Auth.js v5 Kakao provider docs, Kakao Developers, Supabase Kakao guide |
| 다자녀 화면 | 헤더 자녀 chip 토글 (a 안) | image search "parent app multi child selector chip dashboard" |
| 대시보드 단순화 | 6탭 중 portfolio 1개로 축소 + 자랑해요 진입점 | student-portfolio task v1 패턴 재사용 (internal) |

## 핵심 발견

### 1. OAuth 인증 — 표준 Authorization Code + PKCE

Google, Kakao 모두 OAuth 2.0 표준. 서버 콜백(`/api/parent/auth/callback/{provider}`) 가 code → token 교환 + user info fetch 후 ParentSession 쿠키 발급.

콜백 URL 컨벤션:
- Google: `/api/auth/callback/google` (NextAuth 기본 — 교사용 이미 사용 중)
- Kakao: `/api/auth/callback/kakao` (Auth.js Kakao provider docs)

**우리는 학부모 OAuth 를 별도 prefix 로**: `/api/parent/auth/callback/{provider}` — 교사 NextAuth 와 라우트 충돌 방지. 학부모는 Parent 모델 + ParentSession (NextAuth User 모델 X) 라 별도 핸들러 필요.

#### 통합 방식 후보 (phase3 architect 결정)
- **A. NextAuth 멀티 인스턴스** — `parent` slug 로 별도 NextAuth 설정. PrismaAdapter 가 User 모델만 알아서 Parent 매핑 직접 코드. 복잡.
- **B. 커스텀 OAuth 핸들러** — `arctic` 라이브러리(또는 직접) 로 Kakao + Google OAuth 흐름 직접 구현. 토큰 교환 + user info fetch + Parent upsert + ParentSession 발급. 학부모 모델과 1:1 매칭, 이해 용이.

권고: **B 채택**. 학부모 인증은 이미 NextAuth 와 분리된 시스템(Parent + ParentSession) 라 NextAuth 강제 통합 시 추상화 깊어짐. 커스텀 핸들러가 코드량은 적음.

### 2. Account Linking — 이메일 자동 매핑

기존 매직링크 학부모(`Parent.email`) 가 OAuth 로 첫 로그인 시:
1. OAuth user info 의 email = `Parent.email` 매칭 → 기존 row 에 OAuth account 연결 (`ParentOAuthAccount` 신규 모델 또는 Parent 컬럼)
2. 일치 없음 → 신규 Parent row 생성 (이메일 + 이름 + 프로필 이미지)
3. **Kakao email 미공개 케이스**: Kakao 의 email scope 는 비즈니스 검토 통과 전 일반 신청도 가능하나 사용자가 동의 거부 시 email 못 받음. 폴백 — 닉네임 + provider id 로 신규 Parent 생성, 기존 학부모 link 자동 매핑 X (사용자가 자녀 코드 다시 입력해 매칭).

### 3. 다자녀 화면 — 헤더 chip 토글 (a 안)

이미지 서치 결과 ClassDojo / Amazon Parent / 다수 학교 앱이 헤더 좌측 chip + dropdown 패턴 사용. URL 단일(`/parent/home`) 유지하고 자녀 선택은 client state. 딥링크가 필요하면 `?child=studentId` 쿼리.

DJ 보드 헤더 패턴(좌측 제목 + 우측 actions) 과 호환 — 자녀 chip 을 좌측 제목 영역 안에 배치.

### 4. 대시보드 = Portfolio 통합

phase0 사용자 명시: 기존 6탭(portfolio·plant·drawing·assignments·events·breakout) 중 portfolio 가 자녀 카드(모든 보드) + 학급 자랑해요를 이미 통합. 나머지 5 탭 페이지 삭제, 대시보드 = portfolio 본문.

식물 진행도 그래프 / 그림 갤러리 별도 시각화 같은 비-카드 sub-feature 가 portfolio 카드 형태로 안 보일 수 있음. v1 은 그대로 portfolio 만, v2 가 필요하면 별도 task 로 sub-feature 카드 병합.

자랑해요 진입점은 별도 페이지(`/parent/(app)/showcase`) — `/student/showcase` 와 동등 그리드.

### 5. 매직링크 폴백 유지

OAuth 출시 후에도 `/parent/auth/{magic-link 입력}` 라우트 유지. 이유:
- OAuth provider 장애
- 학부모가 OAuth 계정 분실 / 다른 메일 사용
- 기업 메일(Google/Kakao 미연결) 사용 학부모

대시보드 OAuth 버튼이 주 진입점이고, "이메일 링크로 로그인" 버튼이 보조.

---

## 적용 권고 (phase2 strategist 입력)

| 결정 영역 | 권고 | 근거 |
|---|---|---|
| OAuth 통합 방식 | 커스텀 핸들러 (arctic 또는 직접 fetch) | NextAuth 강제 통합 시 추상화 비용 ↑, Parent 모델과 1:1 매핑이 명확 |
| 데이터 모델 | `ParentOAuthAccount { parentId, provider, providerAccountId, email, displayName, profileImage, createdAt }` 신규 join 모델 | 동일 학부모가 Google + Kakao 둘 다 link 가능. unique([provider, providerAccountId]) |
| 이메일 매칭 | OAuth user.email = Parent.email 일치 시 자동 link. 미일치 또는 email scope 거부 시 신규 Parent | 활성 ParentChildLink 보존 |
| 라우트 | `/api/parent/auth/{provider}` (start) + `/api/parent/auth/callback/{provider}` (callback) | NextAuth /api/auth/* 와 충돌 방지 |
| 자녀 셀렉터 | 헤더 좌측 chip dropdown — DJ 헤더 좌측 영역 안 | 사용자 명시 + 학생 portfolio 헤더 패턴 일관 |
| 대시보드 콘텐츠 | `/parent/(app)/home` = `<ParentPortfolioView>` (자녀 카드 + 자랑해요 통합) — 기존 컴포넌트 재사용 | 사용자 명시 + 기존 student-portfolio task 자산 |
| 5 탭 처리 | `child/[studentId]/{plant,drawing,assignments,events,breakout}/page.tsx` 삭제. ChildTabs 컴포넌트 제거 | 사용자 명시 |
| 자랑해요 진입 | 대시보드 헤더 액션 + 본문 CTA — `/parent/(app)/showcase` 신규 | 사용자 명시 + /student/showcase 등가 |
| 출시 | OAuth 버튼 메인 + 매직링크 fallback 보존 (auth 라우트 유지) | 안정화 안전망 |

---

## 명시적 비포함 (v1 OUT)

- Apple / Naver OAuth (Google + Kakao 만)
- 매직링크 deprecate (별도 task)
- plant 진행도 그래프 / drawing 갤러리 별도 sub-feature 보존 (v2 검토)
- 비밀번호 인증
- PWA / push notification

## 미해결 (phase2 strategist 잠금 대상)

1. Kakao email scope 비즈니스 인증 미통과 시 email 매칭 폴백 정확한 UX
2. ParentOAuthAccount unique 제약 — `(provider, providerAccountId)` 또는 `(parentId, provider)` 이중?
3. CSRF / state 매개변수 저장 — 단기 쿠키 vs DB 임시 row
