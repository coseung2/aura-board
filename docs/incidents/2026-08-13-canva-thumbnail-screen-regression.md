# 2026-08-13 — Canva thumbnail `/screen` regression

| 항목 | 값 |
|---|---|
| severity | medium |
| 발생 | 2026-08-13, 운영 보드에서 Canva 카드 썸네일이 모두 동일한 fallback으로 표시된다는 사용자 신고로 감지 |
| 해결 | 2026-08-13, oEmbed `/screen?type=thumbnail` 허용 및 회귀 테스트 추가 |
| 소요 | 진단 및 수정 약 1시간 |

## 증상

운영 보드 `board-mrirxqwp-copy-8c048d32`의 Canva 카드 6개가 실제 디자인
이미지 대신 동일한 보라색·청록색 Canva fallback SVG를 표시했다. 브라우저에서
이미지 요소 자체는 `complete=true`, `naturalWidth=640`, `naturalHeight=360`이어서
깨진 이미지처럼 보이지 않았지만 실제 디자인 내용은 전혀 나타나지 않았다.

운영 요청 증거:

- `GET /api/canva/card-thumbnail?...` → `200 image/svg+xml`
- `X-Canva-Thumbnail-Source: fallback`
- `Cache-Control: private, no-store, max-age=0`
- 내부 `GET /api/canva/thumbnail?design=...&w=640` → `404`
  `{"error":"thumbnail_unavailable"}`
- 같은 시간대 Vercel production error/Canva 로그는 비어 있었다. 이 경로는
  예상된 thumbnail miss를 404/fallback으로 흡수하므로 오류 로그가 없는 것이
  정상 동작의 증거는 아니었다.

## 근본 원인

캐시 삭제나 Canva 장애가 아니었다. Aura Board의
`normalizeResolvedThumbnailUrl()`이 Canva oEmbed가 현재 정상적으로 반환하는
`https://www.canva.com/design/:id/:shareToken/screen?type=thumbnail` URL을 pathname만
보고 무조건 `null`로 버렸다.

2026-08-13 운영 실측 결과:

1. Canva 신규 oEmbed와 legacy oEmbed 모두 `200 application/json`을 반환했다.
2. 응답의 `type`은 `rich`이고 `thumbnail_url`은 `/screen?type=thumbnail`이었다.
3. 해당 `/screen` URL은 `303 See Other`로
   `https://media.canva.com/v2/document-image/...`에 리다이렉트했다.
4. 리다이렉트 최종 응답은 `200 image/png`였다.

따라서 “`/screen`은 이미지가 아니라 HTML/실패 응답이다”라는 코드의 과거
가정이 현재 Canva 계약과 반대였다. 디자인 페이지 HTML에서 직접
`media.canva.com` URL을 추출하지 못한 카드들은 oEmbed까지 정상 도달하고도
그 결과를 버렸고, 연결 계정 API도 사용할 수 없는 공개/비로그인 요청에서는
최종적으로 404와 fallback만 남았다.

## 회귀 계보

이 문제는 같은 처리 방향이 여러 번 뒤집히며 반복됐다.

- `e04e89fe` (`2026-06-09`): oEmbed `/screen` URL을 무효화하는 필터 도입.
- `38932d63` (`2026-07-08`): `/screen`이 리다이렉트 기반 썸네일임을 반영해
  지원하도록 수정.
- `4506a94f` (`2026-07-08`, 6분 뒤): 실제 현재 응답을 재검증하는 계약 테스트
  없이 “`/screen` 필터 복원” 변경으로 일부 필터를 되돌림.
- 이후 `normalizeResolvedThumbnailUrl()`의 오래된 필터는 남았고,
  `bfece989`의 first-page HTML 추출 보완이 성공하는 카드에서만 문제가 가려졌다.
- `304bfde7`은 실제 이미지 조회가 실패해도 항상 fallback SVG를 표시하도록 해
  깨진 이미지 UX는 막았지만, 모든 카드가 fallback인 운영 장애를 성공 응답처럼
  보이게 만들었다.

직접 원인은 `/screen` 필터이며, 반복 회귀를 허용한 과정상 원인은
“Canva URL pathname에 대한 추정”만 테스트하고 실제 oEmbed URL → 리다이렉트 →
이미지 MIME 계약을 테스트하지 않은 것이다.

## 수정

- oEmbed 썸네일 URL은 HTTPS이고 기존 Canva 허용 호스트에 속하는지 검증한다.
- 위 검증을 통과한 `/screen?type=thumbnail` URL은 pathname만으로 거부하지 않고
  기존 서버 fetch가 리다이렉트를 따라가도록 허용한다.
- 최종 응답은 기존과 동일하게 `Content-Type: image/*`일 때만 스트리밍한다.
  따라서 임의 호스트 허용이나 HTML 전달로 안전 경계가 약해지지 않는다.
- 디자인 HTML에 이미지 후보가 없고 oEmbed만 `/screen`을 반환하는 실제 장애
  형태를 회귀 테스트로 추가했다.
- oEmbed가 Canva 외부 호스트를 반환하면 404로 거부하는 보안 테스트를 추가했다.

변경 파일:

- `src/app/api/canva/thumbnail/route.ts`
- `src/app/api/canva/thumbnail/route.vitest.ts`
- `docs/verification-checklist.md`

수정 커밋은 이 문서와 함께 `main`에 게시하며, 정확한 SHA는 해당 파일의 Git
history/blame으로 확인한다. 데이터베이스 마이그레이션과 환경변수 변경은 없다.

## 영향

- 기존 Canva 카드의 저장 데이터나 `PreviewFetchCache` 행은 손실되지 않았다.
- 영향 범위는 공개 페이지 HTML에서 직접 first-page 이미지 URL을 찾지 못하고
  oEmbed `/screen` 경로에 의존하는 Canva 카드다.
- 새 카드와 기존 카드 모두 같은 조회 경로를 사용하므로 둘 다 영향받았다.
- Canva 외 링크, 일반 이미지, YouTube 썸네일에는 영향이 없다.
- fallback이 HTTP 200 이미지였기 때문에 가용성 모니터와 5xx 로그만으로는 감지할
  수 없었다.

## 재발 방지

- `/screen` 문자열 자체를 성공/실패 판정 기준으로 사용하지 않는다. URL의
  protocol/host와 최종 응답 status/MIME을 기준으로 판정한다.
- Canva 썸네일 수정 시 다음 세 경로를 각각 테스트한다.
  1. 디자인 HTML의 `media.canva.com ... page=1` 직접 후보
  2. oEmbed의 `/screen?type=thumbnail` 후보
  3. 실제 후보가 없을 때의 private/no-store fallback
- 운영 검증에서는 `<img>`의 load 완료나 크기만 보지 않는다.
  `/api/canva/card-thumbnail`의 `X-Canva-Thumbnail-Source`가 대표 공개 디자인에서
  `resolved`인지 확인하고, 응답 MIME이 실제 PNG/WebP/JPEG인지 확인한다.
- fallback 응답 수를 별도 신호로 관찰해야 한다. `200` 비율만 보는 모니터링은
  이번 장애를 정상으로 오인한다.
- Canva upstream 동작을 설명하는 주석을 복원하거나 변경할 때는 같은 날 현재
  upstream을 실측하고 그 계약을 테스트로 먼저 고정한다.

## 검증

- 집중 Vitest: `src/app/api/canva/thumbnail/route.vitest.ts`
- card fallback Vitest: `src/app/api/canva/card-thumbnail/route.vitest.ts`
- `npm run typecheck`
- 푸시 후 Vercel 배포 SHA 확인
- 운영 대표 디자인에서 다음을 재확인:
  - 내부 thumbnail route `200 image/*`
  - card-thumbnail `X-Canva-Thumbnail-Source: resolved`
  - 실제 디자인별 이미지가 서로 다르게 렌더링

## 상세

- 운영 배포 진단 기준 SHA: `394e6f3f9aacfc0c6734cf8aaa2564042df56ae5`
- 진단 시 production deployment: `dpl_DJNfeFs5fZji7LcWkku3dJHHvF6M`
- 관련 과거 커밋: `e04e89fe`, `38932d63`, `4506a94f`, `bfece989`,
  `304bfde7`
