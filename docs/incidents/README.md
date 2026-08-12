# Incident 레지스트리

사용자에게 영향이 있었던 장애·회귀는 하루 안에 해결됐더라도 이 폴더에 기록한다.
목적은 원인·증거·조치·재발 방지를 남겨 같은 실수를 반복하지 않는 것이다.

## 기록 절차

1. `docs/incidents/_TEMPLATE.md`를 복사해 `YYYY-MM-DD-간단-슬러그.md`로 만든다.
2. 증상 → 근본 원인 → 수정 → 영향 → 재발 방지 순서로 작성한다.
   - 근본 원인은 "추정"이 아니라 확정된 사실(로그·커밋·요청/응답 증거) 기준으로 적는다.
   - 수정은 커밋 해시, 서버 env/설정 변경, 배포 run ID 등 재현 가능한 증거를 남긴다.
3. 아래 레지스트리 표에 행을 추가한다.
4. 사용자 승인 후 커밋한다 (다른 변경과 섞지 않는다).

## 레지스트리

| 문서 | 발생일 | severity | 상태 | 요약 |
| --- | --- | --- | --- | --- |
| [2026-04-20-upload-payload-too-large.md](./2026-04-20-upload-payload-too-large.md) | 2026-04-20 | high | 해결 | Vercel 함수 본문 4.5MB 한도로 대용량 업로드 실패 → client-direct 업로드로 전환 |
| [2026-08-12-parent-oauth-localhost-redirect.md](./2026-08-12-parent-oauth-localhost-redirect.md) | 2026-08-12 | high | 해결 | Next standalone `req.url`이 localhost 기준 → 학부모 OAuth 콜백/Origin 불일치 |
| [2026-08-12-rls-public-tables-outage.md](./2026-08-12-rls-public-tables-outage.md) | 2026-08-12 | high | 해결 | 공개 테이블에 정책 없이 RLS 활성화 → 일시 장애, 정책/shim 보완 |
| [2026-08-12-kakao-koe101-env-quote.md](./2026-08-12-kakao-koe101-env-quote.md) | 2026-08-12 | high | 해결 | 서버 env 값 끝 `"`+CRLF → Kakao client_id 오염 → KOE101 |
| [2026-08-12-teacher-kakao-configuration-error.md](./2026-08-12-teacher-kakao-configuration-error.md) | 2026-08-12 | medium | 해결 | Kakao provider authorization 오버라이드가 URL 상실 → 교사 로그인 Configuration 에러 |
| [2026-08-12-mobile-oauth-redirect-loop.md](./2026-08-12-mobile-oauth-redirect-loop.md) | 2026-08-12 (발생 2026-07-23) | high | 해결 | 모바일 parent OAuth origin 정규화 리다이렉트 무한 루프 |

## 작성 기준

- 사용자가 인지한 기능 장애, 로그인/보안 관련 회귀, 배포로 인한 회귀 → 기록 대상.
- 예정된 마이그레이션, 내부 리팩터링, 경고 로그 정리 등은 대상 아님.
- 기록 후 레지스트리 행을 갱신하지 않으면 "미기록"과 같다.
