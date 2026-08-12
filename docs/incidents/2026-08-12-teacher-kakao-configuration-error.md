# 2026-08-12 — teacher-kakao-configuration-error

| 항목 | 값 |
|---|---|
| severity | medium |
| 발생 | 2026-08-12 23:28 배포(`378d0251`) 직후 |
| 해결 | 2026-08-12 23:30 배포(`54a19f66`) |
| 소요 | 수십 분 (즉시 회귀 감지·수정) |

## 증상

Kakao 계정 선택 화면(`prompt=select_account`)을 추가한 배포 직후, 교사 Kakao
로그인 시작 시 `/api/auth/error?error=Configuration`으로 리다이렉트됐다.
로그:
`TypeError: Invalid URL ... at new URL` — Google/Apple 로그인은 정상.

## 근본 원인

Auth.js Kakao provider의 기본 `authorization`은 문자열
(`https://kauth.kakao.com/oauth/authorize?scope`)인데, 오버라이드에서 객체
`{ params: { prompt: "select_account" } }`만 넘겨 URL이 상실됐다. authorize URL
생성 시 `new URL(undefined)`가 되어 `Invalid URL` → Configuration 에러.

## 수정

`authorization`에 URL을 명시:
`{ url: "https://kauth.kakao.com/oauth/authorize?scope", params: { prompt: "select_account" } }`
— 커밋 `54a19f66`. 배포 후 교사 Kakao 302 → kauth 정상 확인.

## 영향

교사 Kakao 로그인만 (학부모 흐름은 별도 arctic 경로라 무관).

## 재발 방지

- Auth.js 내장 provider의 `authorization`이 문자열인지 객체인지 확인 후
  오버라이드한다. 객체로 바꿀 때는 `url`을 반드시 유지한다.
- 로그인 provider 변경 배포 직후 Google/Kakao/Apple 각각 sign-in URL 생성
  (302 Location)을 스모크 테스트한다.
