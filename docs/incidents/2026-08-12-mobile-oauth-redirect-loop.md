# 2026-08-12 — mobile-oauth-redirect-loop

| 항목 | 값 |
|---|---|
| severity | high |
| 발생 | 2026-07-23 (커밋 `c1c477aa`)부터 잠복 · 2026-08-12 검증 중 발견 |
| 해결 | 2026-08-12 (커밋 `8be2c3b8` 배포) |
| 소요 | 발견 후 수십 분 |

## 증상

학부모 모바일 OAuth 시작 URL(`/api/parent/auth/kakao?client=mobile`)이
같은 URL로 계속 307 리다이렉트되는 무한 루프. 실기기/Expo Go에서 모바일
Google·Kakao 로그인이 불가능했다(웹 로그인은 무관).

## 근본 원인

`c1c477aa fix: unify parent OAuth login flow`가 추가한 origin 정규화 리다이렉트가
Next standalone의 `req.url` origin(`http://localhost:3000`)을 기준으로 판정해
항상 canonical origin으로 재리다이렉트 → 루프. standalone에서 `req.url`이
실제 공개 origin을 담지 않는 문제(2026-08-12 parent-oauth-localhost-redirect와
동일 뿌리).

## 수정

`requestPublicOrigin()`을 추가해 nginx가 넘기는 `X-Forwarded-Proto` + `Host`
헤더로 공개 origin을 계산하고, canonical과 같으면 리다이렉트하지 않는다 —
커밋 `8be2c3b8`. 배포 후 `client=mobile` 요청이 1회 307 → kauth로 바로
도달하는 것을 확인(루프 없음, prompt 미포함).

## 영향

모바일 학부모 Google/Kakao OAuth 전체 (2026-07-23 이후).

## 재발 방지

- standalone 배포에서 `req.url` origin 사용 금지 — 프록시 헤더 기반 origin 사용.
- `client=mobile` 경로는 배포 후 307 루프 여부(동일 URL 재리다이렉트 횟수)를
  스모크 테스트에 포함한다.
