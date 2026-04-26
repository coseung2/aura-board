# Scope Decision — parent-redesign

## 1. 선택한 UX 패턴

phase1 [ux_patterns.json](../phase1/ux_patterns.json) 6개 모두 채택:

| 패턴 ID | 채택 사유 |
|---|---|
| `oauth-authcode-pkce` | 표준 OAuth 2.0, Google + Kakao 모두 동일 흐름 |
| `account-linking-by-email` | 기존 매직링크 학부모 마이그레이션 비용 0 |
| `header-child-chip-toggle` | 사용자 명시 (a 안), DJ 보드 헤더 패턴 일관 |
| `single-page-portfolio-as-dashboard` | 사용자 명시 — 6탭 → portfolio 1로 단순화 |
| `showcase-entry-button` | 사용자 명시 — `/parent/(app)/showcase` 진입점 |
| `magic-link-fallback` | 안정화 안전망, OAuth 장애 대응 |

## 2. MVP 범위

### IN (이번 task)

**OAuth 인증 (Google + Kakao)**
1. `/api/parent/auth/{provider}` — authorization 시작 (state PKCE 발급, redirect)
2. `/api/parent/auth/callback/{provider}` — code → token 교환 → user info → Parent upsert + OAuth account link → ParentSession 발급 → redirect
3. `/parent/auth` 화면에 OAuth 버튼 2개(Google, Kakao) + 매직링크 fallback 링크
4. 이메일 매칭으로 기존 Parent 자동 link (`Parent.email = oauthUser.email` 기준)
5. Kakao email scope 미동의 케이스: 신규 Parent 생성, 기존 link 자동 매핑 X (사용자가 자녀 코드 재입력)
6. 환경변수: `GOOGLE_PARENT_CLIENT_ID/SECRET`, `KAKAO_PARENT_CLIENT_ID/SECRET`

**데이터 모델**
7. `ParentOAuthAccount` 신규: `parentId`, `provider`, `providerAccountId`, `email?`, `displayName?`, `profileImage?`, `createdAt` — `@@unique([provider, providerAccountId])` + `@@index([parentId])`
8. CSRF state — short-lived signed cookie (`parent_oauth_state`)

**대시보드 / 화면 재설계**
9. `/parent/(app)/home` — 풀폭 헤더(DJ 패턴) + 자녀 chip 셀렉터 + 자녀 portfolio 본문 + 자랑해요 진입 버튼 + 추가 자녀 연동 버튼
10. 자녀 chip dropdown — 다자녀(≥2) 시 노출. 자녀 1명이면 chip 만 표시(드롭다운 X)
11. 자녀 chip 클릭 → 자녀 리스트 dropdown → 선택 시 본문 갱신
12. `/parent/(app)/child/[studentId]/portfolio` 기존 페이지 — 유지 (deep-link 진입)
13. `/parent/(app)/showcase` 신규 — 학급 자랑해요 그리드 (`/student/showcase` 와 동등)
14. `/parent/(app)/child/[studentId]/{plant,drawing,assignments,events,breakout}/page.tsx` 5개 삭제
15. `ChildTabs` 컴포넌트 삭제, `ParentBottomNav` 의 탭 정리

**추가 자녀 연동**
16. 대시보드 헤더에 "+ 자녀 추가" 버튼 → `/parent/onboard/match/code` 진입 (기존 흐름 재사용)

### OUT (이번 task 제외)

| 항목 | 사유 | 후속 |
|---|---|---|
| Apple / Naver OAuth | 1차는 Google + Kakao | v2 후속 task |
| 매직링크 deprecate | 안정화 후 별도 task | 별도 task |
| 비밀번호 인증 | OAuth 채택 | OUT |
| plant 진행도 그래프 / drawing 갤러리 별도 sub-feature 보존 | portfolio 카드로 이미 노출 (이미지/카드 단위) | v2 |
| PWA / push notification | 별도 인프라 | 별도 task |
| 학부모 OAuth 로 다른 디바이스 동시 로그인 제한 | 표준 OAuth 라 기본 허용 | OUT |
| Kakao 비즈니스 인증 통과 자동화 | 운영 절차, 코드 무관 | OUT (수동) |

## 3. 수용 기준 (Acceptance Criteria)

검증 가능한 형태:

1. **AC-1 (OAuth 시작)**: `/parent/auth` 페이지에서 "Google 로그인" / "Kakao 로그인" 버튼 클릭 시 `/api/parent/auth/{provider}` 로 POST → 302 provider authorization endpoint 로 redirect (state cookie 발급).
2. **AC-2 (OAuth 콜백 — 신규)**: provider 콜백에 valid code + matching state → email 일치 Parent 없음 → 신규 Parent 생성 + ParentOAuthAccount 1건 생성 + ParentSession 발급 → `/parent/onboard/match/code` 로 redirect.
3. **AC-3 (OAuth 콜백 — 기존 매직링크 학부모)**: `Parent.email = oauthUser.email` 일치 시 기존 row 에 ParentOAuthAccount link만 추가, Parent 신규 X. 활성 ParentChildLink 보존. ParentSession 발급 → `/parent/home` redirect.
4. **AC-4 (OAuth 콜백 — Kakao email 미동의)**: email scope 거부 → 신규 Parent 생성(email=null), 기존 학부모 link 자동 매핑 안 함. `/parent/onboard/match/code` 로 진입해 자녀 코드 재입력.
5. **AC-5 (state CSRF)**: state cookie 와 callback `state` 쿼리 불일치 시 400 에러. 만료된 state(>10분) 도 거부.
6. **AC-6 (대시보드 — 자녀 1명)**: `/parent/home` 진입 시 헤더에 자녀 이름 chip(드롭다운 표시 없음) + 그 자녀 portfolio 본문(자녀 카드 + 학급 자랑해요).
7. **AC-7 (대시보드 — 자녀 ≥2명)**: 헤더 chip 우측에 ▼ 표시. 클릭 → dropdown 에 자녀 리스트 전체 노출 + "+ 자녀 추가" 항목. 자녀 선택 시 본문 갱신, URL 변경 없음(또는 `?child=ID` 쿼리만).
8. **AC-8 (자랑해요 진입점)**: 대시보드 헤더에 "🌟 우리 학급 자랑해요" 버튼 → `/parent/(app)/showcase` 로 이동 → 학급 자랑해요 그리드 노출.
9. **AC-9 (5탭 삭제)**: `/parent/child/[id]/{plant,drawing,assignments,events,breakout}` 진입 시 404 또는 portfolio 로 redirect. ChildTabs 컴포넌트 삭제 — 어느 페이지에도 import 0건.
10. **AC-10 (추가 자녀 흐름)**: 대시보드 헤더 dropdown 또는 본문 "+ 자녀 추가" 버튼 → `/parent/onboard/match/code` 진입 → 코드/자녀 선택 → ParentChildLink 추가됨 → 대시보드로 redirect → 셀렉터에 새 자녀 등장.
11. **AC-11 (학부모 leak 0건)**: 대시보드 본문 응답에 자녀 외 학생 카드 0건. 학급 자랑해요 진입 시 자녀 학급의 자랑해요만 (다른 학급 leak 0건). student-portfolio task v1 의 AC-8 정책 승계.
12. **AC-12 (typecheck + build)**: `npm run typecheck` + `npm run build` 통과. 기존 매직링크 흐름 회귀 0건.

## 4. 스코프 결정 모드

**Selective Expansion** — 사용자 명시 4축(OAuth + chip selector + portfolio 통합 dashboard + 자랑해요 진입점) 모두 IN. 기존 매직링크 + 6탭의 plant/drawing/assignment 등은 보존(매직링크) 또는 통합(portfolio) 으로 backwards 안전하게.

## 5. 위험 요소

### R1 — Kakao email scope 비즈니스 인증
Kakao OAuth 의 email scope 는 "비즈니스 채널" 인증 통과 시 안정 발급. 미통과 사용자 신청 케이스 일부 사용자 동의 거부 가능. **완화**: AC-4 명시 — email 없으면 신규 Parent + 학급코드 재입력. UX 안내 카피로 "Kakao 메일 동의가 안 됐어요. 자녀 학급 코드를 입력해 자녀와 다시 연동해주세요" 노출.

### R2 — Account linking — 다른 OAuth 기존 link 가 있는 케이스
한 학부모가 처음 Google 로 가입 → 나중에 Kakao 로도 로그인. Kakao email 이 같은 Parent.email 매칭 시 동일 Parent 에 두번째 ParentOAuthAccount 추가하려는데 unique 제약 충돌? 
- `@@unique([provider, providerAccountId])` 라 다른 provider 이면 충돌 X.
- 다른 학부모(다른 사람) 의 Google email 과 우연히 일치하는 Kakao email 케이스 — 이건 보안 이슈. **완화**: 이메일 매칭 시 OAuth verified email 만 신뢰. Kakao "verified" 마커 확인.

### R3 — 5탭 페이지 삭제로 인한 회귀
plant/drawing/assignments/events/breakout 페이지가 외부 링크로 deep-link 되어 있는 학부모가 있으면 404. **완화**: 5개 페이지를 단순 redirect (302 → /parent/home) 으로 처리해 backward 안전. 삭제 X, redirect 만.

### R4 — 다자녀 자녀 셀렉터 상태 손실
URL 단일이면 새로고침/뒤로가기로 자녀 선택 상태 손실. **완화**: URL `?child=studentId` 쿼리로 보존. localStorage 도 사용해 마지막 선택 자녀 자동 복원.

### R5 — 쿠키 충돌 (parent_session vs next-auth.session-token)
같은 브라우저에 학부모(parent_session) + 교사(NextAuth session) 동시 로그인 가능. 학부모 OAuth 콜백이 NextAuth 콜백 라우트를 침범하면 안 됨. **완화**: 학부모 OAuth 라우트를 `/api/parent/auth/...` 로 격리. NextAuth 의 `/api/auth/*` 와 prefix 분리.

### R6 — 환경변수 4개 추가 (배포 영향)
`GOOGLE_PARENT_CLIENT_ID/SECRET`, `KAKAO_PARENT_CLIENT_ID/SECRET` Vercel/사용자 환경에 등록 필요. **완화**: env.example 업데이트, dev 모드에서 env 미설정 시 OAuth 버튼 disabled + "환경변수 미설정" 메시지.

### R7 — magic-link 학부모가 OAuth 로 첫 로그인 시 ParentSession 중복
기존 magic-link ParentSession 살아있을 수 있음. OAuth 콜백이 새 session 발급 시 충돌? **완화**: OAuth 콜백 시 기존 ParentSession revoke + 새 발급. 또는 동일 parentId 의 active session 모두 keep (멀티 디바이스 허용).

---

## 핸드오프

phase3 architect 가 잠가야:
- `ParentOAuthAccount` 정확한 컬럼 + 인덱스
- `arctic` vs 직접 fetch — 라이브러리 채택 여부
- state cookie 포맷 (HMAC signed JSON) + TTL
- 자녀 셀렉터 컴포넌트 위치 (재사용 vs portfolio task 의 헤더에 흡수)
- 5탭 페이지 삭제 vs redirect 정책 — R3 결정
