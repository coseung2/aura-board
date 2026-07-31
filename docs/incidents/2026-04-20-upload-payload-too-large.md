# 2026-04-20 — upload-payload-too-large

| 항목 | 값 |
|---|---|
| severity | high |
| 발생 | 구조적 (상시) · 체감 감지 2026-04-20T12:00 KST |
| 해결 | 2026-04-20T17:51 KST |
| 소요 | 진단·수정·배포·검증 약 6시간 |

## 증상

대용량 PDF 업로드 시 브라우저에 `FUNCTION_PAYLOAD_TOO_LARGE` HTML 오류가 그대로 노출되며 첨부 실패.

## 근본 원인

Vercel Functions 요청 본문 한도(≈4.5MB)가 `/api/upload` 라우트의 multipart 수신 전 단계에서 페이로드를 리젝트. 라우트의 50MB 검사 지점에 도달 불가.

## 수정

`@vercel/blob/client`의 client direct upload로 전환 — 브라우저가 Blob 스토리지에 직접 PUT하며 Vercel Functions 본문을 경유하지 않음. 서버 `handleUpload`가 토큰 발급 단계에서 MIME·확장자·pathname·크기·`addRandomSuffix`를 바인딩.

- 커밋: `b81f5b3`, `af13208`
- 변경: `src/app/api/upload/{route.ts,upload-policy.ts}` · `src/lib/upload-client.ts` · 4 callsite modals
- 회귀 테스트: `src/app/api/upload/upload-policy.vitest.ts` (11 케이스)

## 영향

카드/과제/관찰 일지 파일 첨부 전반. 데이터 손실·권한 사고 없음.

## 재발 방지

- 업로드 엔드포인트 `MAX_SIZE` 상수와 Vercel 플랫폼 한도(4.5MB)의 정합을 PR 체크리스트에 추가.
- 본문 큰 파일을 받는 신규 엔드포인트 설계 시 client-direct 패턴을 기본값으로.
- `/api/student-assets`는 그림보드 기능 폐기와 함께 제거되어 별도 전환 대상이 아니다.

## 상세

`tasks/2026-04-20-upload-payload-too-large/` 전체 phase 산출물 참조.
