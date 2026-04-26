# Deploy Log — parent-redesign (phase10)

## 1. 머지 정보
- 솔로 프로젝트 → PR 없이 main FF 머지 (CLAUDE.md 정책)
- 소스 브랜치: feat/parent-redesign
- 타깃: origin/main
- 방식: git push origin HEAD:main (FF)
- 머지 시각: 2026-04-26 ~17:00 KST

## 2. push 검증 게이트

| 항목 | 결과 |
|---|---|
| npm run build | ✅ |
| npm run typecheck | ✅ 0 errors |
| npx vitest run | ✅ 184/184 (신규 8건) |
| phase8/REVIEW_OK.marker | ✅ |
| phase9/QA_OK.marker | ✅ |

## 3. 배포 대상
- 자체 호스팅 + Supabase ap-northeast-2
- main push = "배포 ready"
- 사용자 환경(메인 워크트리) 에서 git pull && npm run dev (또는 prod) 으로 활성화

## 4. 환경변수 추가 필요 (사용자 작업)

```
GOOGLE_PARENT_CLIENT_ID=
GOOGLE_PARENT_CLIENT_SECRET=
KAKAO_PARENT_CLIENT_ID=
KAKAO_PARENT_CLIENT_SECRET=
PARENT_OAUTH_REDIRECT_BASE_URL=https://aura-board.app   # prod
                                # 또는 http://localhost:3000 (dev)
```

OAuth 콘솔 등록:
- Google Cloud Console → OAuth 2.0 클라이언트 → redirect URI 등록
  · prod: https://aura-board.app/api/parent/auth/callback/google
  · dev:  http://localhost:3000/api/parent/auth/callback/google
- Kakao Developers → 내 애플리케이션 → 카카오 로그인 → redirect URI
  · prod: https://aura-board.app/api/parent/auth/callback/kakao
  · dev:  http://localhost:3000/api/parent/auth/callback/kakao
  · consent: account_email + profile_nickname + profile_image
  · 비즈니스 인증 통과 시 email scope 안정 발급

env 미설정 시 OAuth 버튼 클릭 → 302 /parent/auth?error=provider_disabled.
매직링크 fallback 정상 동작.

## 5. 프로덕션 검증

자체 호스팅 라이브 라우트 sanity:
```
GET /api/parent/auth/google   → 302 /parent/auth?error=provider_disabled (env 미설정 시)
GET /parent/home              → 302 /parent/join (no session)
GET /parent/showcase          → 302 /parent/join (no session)
GET /parent/child/X/plant     → 302 /parent/home (5탭 redirect 동작)
```

## 6. 롤백 계획

### 코드 롤백
git revert {merge_commits} && git push origin main

또는 force-push main 이전 SHA 로:
git push origin {prev}:main --force   # 솔로 프로젝트 안전

### Migration 롤백
npx prisma migrate resolve --rolled-back 20260426_parent_oauth_account
psql $DATABASE_URL -c 'DROP TABLE "ParentOAuthAccount" CASCADE;'

### 환경변수 롤백
4개 env 제거 — OAuth 버튼 자동 disabled, 매직링크는 정상 동작 (전체 fallback).

### 트리거
- account linking 보안 사고 (다른 학부모 leak 의심) → 즉시 OAuth 라우트 차단 + 롤백
- Kakao API 변경 → hotfix 우선

phase11 진입.
