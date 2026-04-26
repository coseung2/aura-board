# QA Report — parent-redesign (phase9)

테스트 환경: dev 서버 (localhost:3000), Supabase ap-northeast-2.
gstack `/qa` 미가용 — 자동 검증(typecheck+build+vitest+API smoke) +
manual sanity 로 동등 절차.

## A. 자동 검증

### Build / Typecheck
```
$ npm run typecheck → 0 errors
$ npm run build      → 통과
```

### Migration
```
$ npx prisma migrate deploy → 20260426_parent_oauth_account 적용
```

### 단위 테스트 (vitest)
```
parent-oauth-state.vitest.ts  (8/8 pass)
  ├─ HMAC sign/verify round-trip
  ├─ 만료 detection (now 인자로 mocking)
  ├─ HMAC 위조 → null
  ├─ payload 변조 + 원본 sig → null
  ├─ 다른 secret → null
  ├─ 형식 깨진 token → null
  └─ optional 필드 보존

전체: 18 test files, 184 tests (이전 176 + 신규 8)
```

## B. AC 매핑

| AC | 검증 방식 | 결과 |
|---|---|---|
| AC-1 OAuth 시작 | route handler smoke + curl 302 redirect 확인 | ✅ |
| AC-2 신규 Parent 생성 | `upsertParentFromOAuth` 분기 (3) 코드 검증 | ✅ |
| AC-3 기존 학부모 link | 분기 (2) verified email 매칭 코드 검증 | ✅ |
| AC-4 Kakao email 거부 | 분기 (3) placeholder email fallback 코드 검증 | ✅ |
| AC-5 state CSRF | parent-oauth-state.vitest 8 tests | ✅ 자동 |
| AC-6 자녀 1명 chip | ParentChildSelector `is-static` 코드 검증 | ✅ |
| AC-7 자녀 ≥2명 dropdown | listbox + outside click + ESC 코드 검증 | ✅ |
| AC-8 자랑해요 진입점 | 대시보드 헤더 [🌟 자랑해요] Link 코드 검증 | ✅ |
| AC-9 5탭 삭제 | 5 페이지 모두 redirect, ChildTabs 사용처 0 검증 (grep) | ✅ |
| AC-10 추가 자녀 흐름 | 헤더 [+ 자녀 추가] + dropdown 마지막 항목 코드 검증 | ✅ |
| AC-11 leak 0 | ShowcaseGalleryView/ParentPortfolioView 기존 student-portfolio 가드 승계 | ✅ |
| AC-12 typecheck + build | A 항목 자동 통과 | ✅ |

## C. API smoke (curl)

```
GET /api/parent/auth/google   (env 미설정 dev)  → 302 /parent/auth?error=provider_disabled
GET /api/parent/auth/kakao    (env 미설정 dev)  → 302 /parent/auth?error=provider_disabled
GET /api/parent/auth/foo      (잘못된 provider) → 400 invalid_provider
GET /api/parent/auth/callback/google?code=x&state=y  (no cookie) → 302 /parent/auth?error=invalid_state
GET /parent/home              (no session)        → redirect /parent/join
GET /parent/showcase          (no session)        → redirect /parent/join
```

모든 경로 정상 — 미인증 0 데이터 누출.

## D. 페이지 라우트 컴파일 (next build 출력)

```
ƒ /api/parent/auth/[provider]
ƒ /api/parent/auth/callback/[provider]
ƒ /parent/(app)/home
ƒ /parent/(app)/showcase
ƒ /parent/(app)/child/[studentId]
ƒ /parent/(app)/child/[studentId]/{plant,drawing,assignments,events,breakout}  ← redirect
ƒ /parent/(app)/child/[studentId]/portfolio
```

5탭 redirect 페이지도 컴파일 OK.

## E. 잠재 이슈 (인지된 한계)

### E1 — placeholder email 발송 처리
Kakao email 거부 케이스 신규 Parent 의 email = `oauth-kakao-{id}@noemail.aura.local`. 이 도메인으로 매직링크/리마인더 발송 시 bounce. Resend 가 bounce 누적 시 sender reputation 영향.

**완화**: 별도 task 로 parent-email 발송 path 에서 도메인 check 후 skip. 또는 Resend 의 suppression list 자동 등록. v1 출시 시점 영향 작음(이메일 발송은 OAuth 신규 학부모 첫 로그인에 무관).

### E2 — 환경변수 4개 dev 미설정
OAuth 버튼 클릭 시 `/parent/auth?error=provider_disabled` 로 redirect. 사용자 안내 메시지 추가 권장 (현재는 query param 만, /parent/auth 페이지에서 error 디스플레이는 별도 작업).

### E3 — 실제 OAuth flow 라이브 테스트 불가
Google/Kakao OAuth 콘솔 등록 + redirect URI 설정 + env 4개 사용자가 직접 추가해야 라이브 검증 가능. 본 phase 는 코드 + 단위 테스트 검증으로 대체.

### E4 — Chrome MCP 검증 한계
실제 OAuth 콜백 흐름은 외부 provider 응답 필요 — 자동화 어려움. 로컬 dev 서버에서 페이지 렌더링은 manual 또는 phase10 배포 후 production 검증.

## F. 회귀 테스트

- `parent-oauth-state.vitest.ts` 8건 — phase9 신규
- 기존 176 → 184 (+8) 모두 통과

## G. 판정

**PASS** — 자동 검증 모두 통과. 라이브 OAuth 검증은 사용자 환경 (env 등록 + 콘솔 설정) 후 phase10 배포 단계에서. v1 출시 OK.

`QA_OK.marker` 생성 → phase10 진입.
