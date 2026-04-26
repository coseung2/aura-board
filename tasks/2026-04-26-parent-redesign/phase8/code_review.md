# Code Review — parent-redesign (phase8)

리뷰자: Claude self-review (staff engineer 관점). gstack /review 미가용 동등 절차.

## 1. design_doc 준수 검증

| design_doc 요소 | 구현 위치 | 상태 |
|---|---|---|
| ParentOAuthAccount 모델 | `prisma/schema.prisma` + `migrations/20260426_parent_oauth_account/` | ✅ |
| state cookie HMAC | `src/lib/parent-oauth-state.ts` (pure) + `parent-oauth.ts` (cookie) | ✅ pure 분리로 테스트 가능 |
| arctic 라이브러리 | `package.json arctic@^3.7.0` | ✅ |
| 신규 API 2건 | `/api/parent/auth/[provider]` + `callback/[provider]` | ✅ |
| account linking 3분기 | `parent-oauth.ts upsertParentFromOAuth` | ✅ 매칭 → 이메일 → 신규 (placeholder email fallback) |
| ParentDashboard + ChildSelector | `components/parent/ParentDashboard.tsx`, `ParentChildSelector.tsx` | ✅ |
| /parent/(app)/showcase | `app/parent/(app)/showcase/page.tsx` | ✅ ShowcaseGalleryView 재사용 |
| 5탭 redirect | `child/[id]/{plant,drawing,assignments,events,breakout}/page.tsx` 모두 redirect | ✅ |
| ChildTabs 삭제 | `src/components/parent/ChildTabs.tsx` 삭제 + 사용처 0 | ✅ |

## 2. AC 매핑

| AC | 검증 |
|---|---|
| AC-1 OAuth 시작 | `/api/parent/auth/[provider]` route — state cookie + 302 ✅ |
| AC-2 신규 학부모 콜백 | `upsertParentFromOAuth` 분기 (3) — 신규 Parent + ParentOAuthAccount ✅ |
| AC-3 기존 매직링크 학부모 link | 분기 (2) — verified email 매칭 → 기존 Parent + 신규 ParentOAuthAccount ✅ |
| AC-4 Kakao email 미동의 | placeholder email fallback (oauth-{provider}-{id}@noemail.aura.local) — Parent 생성, link 자동 매핑 X ✅ |
| AC-5 state CSRF | `verifyStateToken` HMAC + exp + 단위 테스트 8건 ✅ |
| AC-6 자녀 1명 chip | `ParentChildSelector` `is-static` 분기 ✅ |
| AC-7 자녀 ≥2명 dropdown | listbox role + 키보드 네비 + outside click + ESC ✅ |
| AC-8 자랑해요 진입점 | 헤더 액션 [🌟 자랑해요] → /parent/showcase ✅ |
| AC-9 5탭 삭제 | redirect 페이지 5건 + ChildTabs 컴포넌트 삭제 ✅ |
| AC-10 추가 자녀 흐름 | 헤더 [+ 자녀 추가] + dropdown 마지막 항목 → /parent/onboard/match/code ✅ |
| AC-11 leak 0 | ShowcaseGalleryView API gate 학부모 학급만, ParentPortfolioView 자녀만 ✅ |
| AC-12 typecheck + build | 통과 ✅ |

## 3. Karpathy 4 원칙

### Think Before Coding ✅
모든 가정 phase3 design_doc 에 명시. arctic vs custom — phase1 에서 비교 후 arctic 채택.

### Simplicity First ✅
- pure HMAC 모듈 분리 (parent-oauth-state.ts) — server-only 의존 없이 단위 테스트 가능
- 5탭 페이지 삭제 X redirect 유지 — backwards safety
- magic-link 폴백 — 안정화 안전망
- placeholder email — schema 변경 회피 (Parent.email 그대로 required)

### Surgical Changes ✅
- diff 모든 변경 사용자 요구 매핑: OAuth(2~5) / 화면(1번 사용자 발화) / 5탭 통합(2번 사용자 발화)
- 인접 코드 개선 없음 (parent-session.ts 무변경, parent-magic-link.ts 무변경)

### Goal-Driven Execution ✅
모든 변경이 12 AC 중 하나 매핑.

## 4. 보안 감사 (OAuth 특화)

| 항목 | 평가 |
|---|---|
| **CSRF state**: HMAC + exp + timingSafeEqual + cookie one-shot (popStateCookie) | ✅ 8 unit tests |
| **PKCE (Google)**: codeVerifier in signed cookie, 검증 시 arctic 라이브러리 처리 | ✅ |
| **Account linking 보안**: verified email 만 자동 link. unverified email 거부 | ✅ R2 완화 |
| **Redirect 우회**: callback 의 redirect destination 은 hardcoded (/parent/home or /parent/onboard/match/code). open redirect 우회 X | ✅ |
| **Token 저장**: access_token 메모리만 — DB 저장 X (재요청 시 다시 OAuth flow). refresh token 미사용 | ✅ |
| **PII**: ParentOAuthAccount 의 email/displayName/profileImage 는 OAuth 응답 그대로 — Parent 와 동등 보호 | ✅ |
| **OWASP A01 Broken Access Control**: callback 라우트는 state 검증으로 신뢰 | ✅ |
| **OWASP A07 Auth Failures**: state 만료/위조/누락 모두 errRedirect — 401 흐름 일관 | ✅ |

## 5. 정리된 이슈 / 권고 (phase9 QA 에서 확인)

| # | 항목 | 조치 |
|---|---|---|
| I1 | placeholder email 형식 (`oauth-{provider}-{id}@noemail.aura.local`) | parent-email 발송 시 `@noemail.aura.local` 도메인 skip 처리 — 별도 task. 현재는 보내고 bounce 처리 |
| I2 | localStorage `parent-dashboard-last-child` 만료 정책 | v1 무한. 자녀 link revoke 시 삭제 — 별도 task |
| I3 | Kakao access_token 검증 | arctic 라이브러리가 처리. 추가 검증 X |

## 6. 판정

**전체 PASS**. design_doc 일치, 12 AC 매핑, 보안 감사 통과, 184/184 vitest pass (8개 신규).

phase9 진입.
