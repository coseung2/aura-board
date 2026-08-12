# 2026-08-12 — kakao-koe101-env-quote

| 항목 | 값 |
|---|---|
| severity | high |
| 발생 | 2026-08-12 밤 (Kakao 키 서버 반영 직후) |
| 해결 | 2026-08-12 23:15경 (env 정리 + 서비스 재시작) |
| 소요 | 약 1시간 |

## 증상

웹앱 교사/학부모 Kakao 로그인 버튼 클릭 시 Kakao가
`KOE101 — 앱 관리자 설정 오류 (서비스 설정에 오류가 있어, 이용할 수 없습니다)`를
반환. 카카오 디벨로퍼 콘솔 설정은 변경된 적 없음.

## 근본 원인

`/etc/aura-board/app.env`에 `KAKAO_PARENT_CLIENT_ID`/`KAKAO_PARENT_CLIENT_SECRET`
(및 `AUTH_APPLE_ID`/`AUTH_APPLE_SECRET`)를 기록할 때 값 끝에 `"`(따옴표)와
CRLF가 함께 들어갔다. systemd가 `client_id=a9386...fe"` 그대로 앱에 전달했고,
앱이 만든 authorize URL에 `%22`가 포함돼 존재하지 않는 client_id가 되어 KOE101이
발생했다. 브라우저 세션 없이 curl로 직접 치면 로그인 페이지 302로 통과해
"키는 정상"으로 오인됐다.

증거: 라이브 authorize URL `client_id=...fe%22`, env 바이트 덤프에서
`a9386...fe" \r \n`.

## 수정

- `KAKAO_PARENT_CLIENT_ID`/`KAKAO_PARENT_CLIENT_SECRET`/`AUTH_APPLE_ID`/
  `AUTH_APPLE_SECRET` 4개 값의 trailing quote + CRLF 제거, 중복 `AUTH_URL=""`
  라인 정리.
- 백업: `/etc/aura-board/app.env.bak-kakao-apple-quote-20260812230744`.
- `aura-board-app` 재시작 후 authorize URL에 `%22` 없는 것을 확인(교사/학부모
  모두 302 → kauth).

## 영향

교사/학부모 Kakao 로그인 전체, Apple 웹 로그인 키도 동일 결함(함께 수정).
데이터 손실 없음.

## 재발 방지

- 서버 env 기록 시 `KEY=value` 형태(따옴표·CRLF 없이)로 쓴다. PowerShell
  here-string/파이프로 쓰면 CRLF가 섞일 수 있으므로 원격에서 `tr -d '\r'` 후
  적용하거나 LF 고정 도구를 사용한다.
- env 반영 후 authorize URL에 `%22`/`\r`이 없는지 1회 검증한다.
