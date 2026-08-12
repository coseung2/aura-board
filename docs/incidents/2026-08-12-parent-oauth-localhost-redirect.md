# 2026-08-12 — parent-oauth-localhost-redirect

| 항목 | 값 |
|---|---|
| severity | high |
| 발생 | 2026-08-12 오후 (사용자 보고: 학부모 Google 로그인 후 localhost 리다이렉트, 학부모 아이디 로그인 403) |
| 해결 | 2026-08-12 (커밋 `44e48d81` 배포 후 검증) |
| 소요 | 당일 진단·수정·배포 |

## 증상

웹앱에서 학부모 Google 로그인 시 Google 계정 선택 뒤
`http://localhost:3000/api/...`(또는 `localhost` 기준 콜백)로 리다이렉트되어
"사이트에 연결할 수 없음"/400 오류가 표시됐다. 학부모 아이디(ID) 로그인도
Origin 불일치로 403이 났다. 교사 로그인은 정상.

## 근본 원인

Next.js standalone 배포에서 `req.url`이 항상 `http://localhost:3000` 기준으로
만들어진다(nginx 뒤). OAuth 콜백/Origin 검증 코드가 `req.url`을 그대로 사용해
브라우저가 localhost로 리다이렉트되거나 Origin 불일치로 거부됐다.

## 수정

- `src/lib/credential-request.ts`(및 관련 경로)가 `PUBLIC_ORIGIN`을 허용하도록
  수정 — 커밋 `44e48d81` `fix(auth): accept public origin for browser credential
  writes behind nginx`.
- 배포 run `31602186909` 성공 후 실서버에서 401/302 정상 응답 확인.

## 영향

학부모 OAuth(Google/Kakao) 로그인 전체, 학부모 아이디 로그인 403. 데이터 손실·
보안 영향 없음.

## 재발 방지

- standalone 환경에서 `req.url`의 origin을 신뢰하지 않는다. nginx가 넘기는
  `X-Forwarded-Proto`/`Host` 또는 `PUBLIC_ORIGIN`을 사용한다.
- 같은 패턴의 버그 2건이 같은 날 추가 발견됨: 교사 로그인 Configuration 에러
  (Kakao provider URL), 모바일 parent OAuth 무한 리다이렉트 — 각각
  `2026-08-12-teacher-kakao-configuration-error.md`,
  `2026-08-12-mobile-oauth-redirect-loop.md` 참조.
