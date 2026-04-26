# Design Doc — parent-redesign

## 1. 데이터 모델 변경

### 신규: `ParentOAuthAccount`

```prisma
model ParentOAuthAccount {
  id                String   @id @default(cuid())
  parentId          String
  provider          String   // "google" | "kakao"
  providerAccountId String   // OAuth provider 의 user id
  email             String?  // OAuth 응답에서 받은 이메일 (verified만 신뢰)
  emailVerified     Boolean  @default(false)
  displayName       String?  // OAuth nickname / name
  profileImage      String?  // OAuth profile image URL
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  parent Parent @relation(fields: [parentId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
  @@index([parentId])
  @@index([email])
}
```

`Parent` 에 reverse relation:
```prisma
model Parent {
  // ... 기존 ...
  oauthAccounts ParentOAuthAccount[]
}
```

### 마이그레이션 `20260426_parent_oauth_account`

신규 테이블만. 기존 row touch X. zero-downtime.

### 인덱스 사유
- `@@unique([provider, providerAccountId])` — 한 OAuth 계정 = 한 학부모 1:1
- `@@index([parentId])` — 학부모별 연결된 OAuth 조회 (계정 settings 화면용)
- `@@index([email])` — 매직링크 → OAuth 자동 link 시 email 매칭

---

## 2. API 변경

### 신규 라우트

#### `GET /api/parent/auth/{provider}` — authorization 시작
- provider ∈ {`google`, `kakao`}
- HMAC-signed `parent_oauth_state` 쿠키 발급 (10분 TTL)
- 302 → provider authorization endpoint (with `state`, `redirect_uri`, `scope`)
- Google scope: `openid email profile`
- Kakao scope: `account_email profile_nickname profile_image`

#### `GET /api/parent/auth/callback/{provider}` — 콜백
요청 쿼리: `code`, `state`
1. `parent_oauth_state` 쿠키와 `state` 일치 검증 (CSRF)
2. provider token endpoint 로 `code` → access_token 교환
3. provider user info endpoint 호출 → `{ id, email?, emailVerified?, name?, picture? }`
4. **Account linking 흐름**:
   - `(provider, providerAccountId)` 매칭 → 기존 ParentOAuthAccount + Parent 즉시 사용
   - 없음 + email 있고 verified → `Parent.email` 일치하는 row → ParentOAuthAccount 신규 생성, 기존 Parent 에 link
   - 없음 + email 미동의/미일치 → 신규 Parent + ParentOAuthAccount 생성
5. ParentSession 발급 (기존 `createParentSession` 재사용)
6. 응답: redirect — 신규 학부모면 `/parent/onboard/match/code`, 기존이면 `/parent/home`

#### `POST /api/parent/auth/logout` — 기존 재사용
NextAuth + 매직링크 모두 일치.

### 기존 라우트 (변경 없음)
- `/api/parent/match/*` — 학급 코드 입력 / 자녀 선택 / 매칭 요청
- `/api/parent/approvals/*` — 교사 승인
- `/api/parent/portfolio` — 자녀 portfolio + 학급 자랑해요

### 환경변수 (4 신규)
```
GOOGLE_PARENT_CLIENT_ID
GOOGLE_PARENT_CLIENT_SECRET
KAKAO_PARENT_CLIENT_ID
KAKAO_PARENT_CLIENT_SECRET
PARENT_OAUTH_REDIRECT_BASE_URL  # https://aura-board.app 또는 dev http://localhost:3000
```

### Library 채택
- **arctic** — Lucia 기반 OAuth client. Google + Kakao 모두 지원, 가벼움 (~5KB), TypeScript first
- 또는 직접 fetch 로 토큰 교환 — 의존성 0 추가, 코드 ~50줄
- **권고: arctic**. 라이브러리 dx ↑, edge case (token refresh, error normalization) 신경 X

---

## 3. 컴포넌트 변경

### 신규
- `src/components/parent/ParentAuthButtons.tsx` — Google + Kakao 버튼 + 매직링크 fallback 링크
- `src/components/parent/ParentChildSelector.tsx` — 헤더 chip dropdown (자녀 ≥2명일 때)
- `src/components/parent/ParentDashboard.tsx` — 풀폭 헤더 + 셀렉터 + ParentPortfolioView 본문 + 액션 버튼
- `src/app/parent/(app)/showcase/page.tsx` — 학급 자랑해요 그리드 (`ShowcaseGalleryView` 재사용)

### 수정
- `src/app/parent/auth/page.tsx` — 매직링크 input + OAuth 버튼 2개 추가
- `src/app/parent/(app)/home/page.tsx` — 풀 재설계 (ParentDashboard 호출)
- `src/components/parent/ChildTabs.tsx` — 삭제
- `src/components/parent/ParentBottomNav.tsx` — 정리 (탭 라벨 갱신)
- `src/lib/parent-session.ts` — 호출자 동일 (변경 없음)
- `src/lib/parent-oauth.ts` — 신규: arctic provider 인스턴스, state cookie helper, account linking logic

### 삭제
- `src/app/parent/(app)/child/[studentId]/{plant,drawing,assignments,events,breakout}/page.tsx` — 5개 페이지 → 302 redirect 로 대체 (R3 backwards safety)

### 상태 위치
- 자녀 셀렉터 selectedChildId — URL `?child=studentId` 쿼리 (R4 보존) + localStorage 마지막 선택
- OAuth state — `parent_oauth_state` HMAC signed cookie

---

## 4. 데이터 흐름 다이어그램

### OAuth 신규 가입 (Kakao 예시)

```
[학부모 브라우저] → /parent/auth — Kakao 버튼 클릭
                  ↓ POST
[Next.js] /api/parent/auth/kakao
                  ↓ state cookie 발급
                  ↓ 302
[Kakao authorization page] → 학부모 동의
                  ↓ code + state
[Next.js] /api/parent/auth/callback/kakao
                  ↓ state 검증 (cookie vs query)
                  ↓ POST kakao /oauth/token (code → access_token)
                  ↓ GET kakao /v2/user/me (access_token → user info)
[App logic]
  ├─ ParentOAuthAccount(kakao, providerAccountId) 매칭 시도 → 없음
  ├─ Parent.email = userInfo.email 매칭 → 없음
  ├─ Parent 신규 + ParentOAuthAccount 1건 생성
  ├─ createParentSession → set-cookie parent_session
  └─ 302 → /parent/onboard/match/code
```

### OAuth 재방문 (이미 link 된 학부모)

```
[학부모] /parent/auth — Google 버튼 클릭
       → /api/parent/auth/google → 302 google
       ← code + state → /api/parent/auth/callback/google
       → ParentOAuthAccount(google, providerAccountId) 매칭 → 기존 Parent
       → ParentSession 발급
       → 302 /parent/home
```

### 대시보드 자녀 셀렉터

```
[/parent/home server component]
  ├─ getCurrentParent → Parent
  ├─ findMany ParentChildLink (status=active) → children[]
  ├─ url?child=ID 또는 children[0].studentId 으로 selectedId 결정
  └─ <ParentDashboard children={...} selectedId={...} />
        └─ <ParentChildSelector /> + <ParentPortfolioView childId={selectedId} />
              ↓ 셀렉터 변경 시
              router.replace(`/parent/home?child=${newId}`)
```

---

## 5. 엣지케이스 (≥5)

| # | 케이스 | 처리 |
|---|---|---|
| E1 | OAuth state cookie 만료/위조 | 400 `invalid_state`, /parent/auth?error=oauth_state |
| E2 | provider token 교환 실패 (잘못된 code, network error) | 502 `provider_error`, 에러 페이지 안내 |
| E3 | Kakao email scope 거부 | email=null 신규 Parent. UX 카피로 안내 |
| E4 | 학부모가 OAuth 로 첫 로그인했는데 자녀 매칭 미완 | /parent/onboard/match/code 강제 진입 (대시보드 X) |
| E5 | 다자녀 학부모가 자녀 선택 안 함 | URL 쿼리 없으면 children[0] 자동 선택 + localStorage 복원 |
| E6 | 같은 브라우저에 교사 NextAuth session + 학부모 OAuth 동시 | 쿠키 prefix 분리 (`parent_session` vs `next-auth.session-token`) — 충돌 X |
| E7 | 5탭 deep-link 잔존 (북마크/알림 메일) | redirect 302 → /parent/home (R3 backwards safety) |
| E8 | 환경변수 미설정 (dev) | OAuth 버튼 disabled + "OAuth 환경변수 미설정" 메시지. 매직링크는 정상 동작 |
| E9 | 학부모가 Google + Kakao 두 OAuth 다 link | ParentOAuthAccount 두 개 row, Parent 1개. 어느 쪽으로 로그인해도 동일 Parent |
| E10 | 다른 학부모(다른 사람) 의 Google email 과 우연히 같은 Kakao email | OAuth verified email 만 신뢰. Kakao "verified=true" 마커 확인 후 매칭. unverified 면 별도 Parent (R2 완화) |

---

## 6. DX 영향

- **타입**: `ParentOAuthAccountDTO`, `OAuthUserInfo`, `OAuthProvider` 신규
- **린트**: 신규 디렉토리 없음, 기존 패턴 따름
- **테스트**:
  - Unit: `parent-oauth-state.vitest.ts` (HMAC sign/verify), `parent-oauth-account-link.vitest.ts` (매칭 로직)
  - Integration: AC-2~AC-5 callback 라우트
  - E2E: phase9 QA Playwright 또는 manual
- **빌드**: `arctic` 의존성 추가 (~5KB). prisma migrate 1건
- **배포**: env 4개 추가 (Vercel/사용자 환경 설정 필요)

---

## 7. 롤백 계획

### 코드 롤백
```bash
git revert {merge_commit_range}
git push origin main
```

### Migration 롤백 (필요 시)
```bash
npx prisma migrate resolve --rolled-back 20260426_parent_oauth_account
psql $DATABASE_URL -c 'DROP TABLE "ParentOAuthAccount" CASCADE;'
```
ParentOAuthAccount 외 변경 X. 기존 학부모 데이터 영향 0.

### 환경변수 롤백
4개 env 제거 — OAuth 버튼이 disabled 됨, 매직링크는 정상 동작 (전체 fallback).

### 트리거 조건
- account linking 보안 사고 (다른 학부모 leak 의심) → 즉시 OAuth 라우트 차단 + 롤백
- Kakao API 변경 (deprecation) → hotfix 우선

---

## 핸드오프

phase4 design_planner 가 보강:
- ParentChildSelector dropdown 인터랙션 (드롭다운 모양, 키보드 네비게이션, 빈 상태)
- 대시보드 헤더 actions 영역 정확한 배치 (자랑해요 버튼 + "+ 자녀 추가" 버튼 + 매직링크 fallback 링크)
- /parent/auth 페이지 OAuth 버튼 디자인 (Google official + Kakao official 색상)
- 5탭 redirect 페이지의 안내 메시지 (필요 시)
