# 2026-09-02 — Mobile Canva thumbnail native-origin regression

| 항목 | 값 |
|---|---|
| severity | medium |
| 발생 | 2026-09-02, 모바일 앱 v10 실제 사용 중 Canva 링크 카드가 썸네일 없이 검은 미디어 영역과 `Canva 열기` 문구만 표시된다는 사용자 신고로 감지 |
| 해결 | 2026-09-02 코드 수정 완료, 모바일 배포 및 실기기 재검증 전 |
| 소요 | 진단 및 코드 수정 진행 중 |

## 증상

모바일 보드에서 Canva 디자인 링크 카드가 보드 진입 직후 썸네일을 표시하지 않고,
검은 미디어 영역 위에 `Canva 열기` 문구만 표시됐다.

Canva를 한 번 열었다가 보드로 돌아와도 썸네일이 나타나지 않았다. 기대 동작은
Canva WebView를 먼저 열지 않아도 보드 진입 시점에 디자인 썸네일이 보이고,
뒤로 이동한 뒤에도 같은 썸네일이 디스크 캐시에서 재사용되는 것이다.

모바일 보드 상세 화면에는 이미 다음 프리페치 로직이 존재했다.

- `apps/mobile/app/(student)/board/[slug].tsx`
- `Image.prefetch(previewUrls, "memory-disk")`
- `previewUrls`는 `mediaPreviewUrls(buildMediaItems(card))`에서 생성

따라서 문제는 "프리페치 자체가 없음"이 아니라 프리페치에 전달되는 Canva
썸네일 URL이 네이티브 앱에서 유효하지 않거나, 레거시 카드에서는 아예 존재하지
않는 것이었다.

## 근본 원인

### 1. 웹 상대 URL을 네이티브 이미지 URL처럼 전달했다

서버의 Canva 카드 생성 경로는 oEmbed 또는 디자인 URL에서 얻은 썸네일을
`proxiedCanvaThumbnailUrl()`로 정규화하며, 결과가 다음과 같은 Aura Board
same-origin 상대 URL이 될 수 있다.

`/api/canva/thumbnail?design=...&w=640`

웹 브라우저는 이 URL을 현재 페이지 origin 기준으로 자동 해석한다. 반면
React Native의 `expo-image`와 `Image.prefetch`에는 문서 origin 개념이 없다.

기존 `apps/mobile/lib/media.ts`의 `buildMediaItems()`는 `linkImage`와 attachment의
`previewUrl`을 변환하지 않고 그대로 `MediaItem.previewUrl`에 넣었다. 그 결과
웹에서는 정상인 상대 URL이 네이티브에서는 로드할 수 없는 URI가 됐다.

### 2. 프리페치와 실제 렌더가 같은 잘못된 URL을 공유했다

2026-08-04 커밋 `e5972e3c`에서 보드 진입 시 이미지 프리페치가 추가됐지만,
프리페치 URL은 기존 `buildMediaItems()`와 `mediaPreviewUrls()` 결과를 그대로
사용했다.

즉 캐시 정책은 `memory-disk`로 올바르게 설정돼 있었지만 캐시 키의 원본 URI가
네이티브에서 해석 불가능한 상대 URL이면 네트워크 요청 자체가 성공하지 않는다.
따라서 한 번 실패한 뒤 보드로 돌아와도 보여 줄 캐시 엔트리가 생성되지 않았다.

### 3. Canva WebView를 열어도 썸네일을 생성하는 구조가 아니다

`EmbeddedMedia`는 Canva 디자인을 WebView로 렌더하지만 WebView 화면을 캡처해
`linkImage`나 expo-image 캐시에 저장하는 경로는 없다.

따라서 "한 번 Canva를 열면 다음에는 썸네일이 생길 것"이라는 동작은 구현상
발생하지 않는다. 초기 썸네일 URL이 실패하면 이후에도 검은 fallback이 유지되는
것이 기존 코드의 자연스러운 결과였다.

### 4. 레거시 Canva 카드의 `linkImage=null`을 모바일에서 복구하지 않았다

과거 Canva oEmbed/thumbnail 회귀로 생성된 카드 중에는 `linkUrl`은 유효하지만
`linkImage`가 비어 있는 카드가 존재할 수 있다. 모바일 기존 구현은 YouTube에
대해서는 link URL에서 deterministic thumbnail을 유도했지만 Canva 디자인 URL에
대해서는 같은 fallback을 제공하지 않았다.

이번 수정 전에는 이런 카드를 다시 저장하거나 서버 데이터를 마이그레이션하지
않으면 보드 진입 시 썸네일 후보 자체가 없었다.

## 왜 반복됐는가

이 문제는 2026-08-13의
[`Canva thumbnail /screen regression`](./2026-08-13-canva-thumbnail-screen-regression.md)
과 화면 증상은 비슷하지만 직접 원인은 다르다.

8월 인시던트는 서버가 Canva의 정상 `/screen?type=thumbnail` URL을 잘못 거부해
thumbnail proxy가 fallback을 반환한 문제였다. 당시 재발 방지는 다음 서버 계약을
중심으로 구성됐다.

- Canva oEmbed `/screen` redirect 허용
- 최종 `image/*` MIME 확인
- `/api/canva/thumbnail`과 card-thumbnail wrapper 각각 검증
- public-origin self-fetch 제거

하지만 다음 네이티브 계약은 검증 항목에 없었다.

- API가 반환하는 `/api/...` 상대 preview URL을 native absolute URL로 바꾸는지
- 보드 cold entry에서 Canva를 열기 전에 썸네일이 표시되는지
- `Image.prefetch`와 실제 `<Image>`가 동일한 정규화 URL을 사용하는지
- `linkImage=null`인 기존 Canva 카드도 design URL만으로 복구되는지
- 화면을 열고 뒤로 왔을 때 이전 WebView 상태가 아니라 image disk cache를
  사용하는지

또한 모바일 media helper는 2026-06-16 커밋 `e11600c1`에서 웹 데이터 구조를
가볍게 포팅하면서 `previewUrl`을 그대로 전달하는 형태로 시작했다. 이후 개별 화면은
필요할 때 `getApiUrl()`을 직접 사용했지만, 카드 미디어 전체에 적용되는 단일
"native asset URL normalization" 계약은 없었다.

결론적으로 반복 원인은 Canva 자체보다 **웹과 네이티브가 같은 DTO를 소비하면서
URL 해석 규칙을 공유하지 않은 구조**, 그리고 **서버 Canva 테스트만으로 모바일
표시 계약까지 검증됐다고 간주한 검증 공백**이다.

## 수정

2026-09-02 working tree에서 `apps/mobile/lib/media.ts`를 다음과 같이 수정했다.

- Aura Board 소유 상대 asset URL은 `getApiUrl()`로 native absolute URL로 변환한다.
- Canva 디자인 링크는 저장된 `linkImage`보다 디자인 URL에서 안정적인
  `/api/canva/thumbnail?design=...&w=640` URL을 우선 유도한다.
- link attachment의 `previewUrl`도 같은 규칙을 적용한다.
- `linkImage=null`인 레거시 Canva 카드도 `linkUrl`만 있으면 썸네일 proxy URL을
  생성한다.
- `mediaPreviewUrls()` 역시 같은 URL 정규화를 사용해 보드 진입 prefetch와 실제
  렌더가 같은 URI를 사용하도록 맞춘다.

관련 현재 변경 파일:

- `apps/mobile/lib/media.ts`
- `apps/mobile/components/layouts/ColumnsStreamFeedPost.tsx`

검증 결과:

- `apps/mobile`: `npm run design:check` 통과
- `git diff --check` 통과
- `npm run typecheck`는 이번 변경의 TypeScript 오류가 아니라 이전 실패한 dependency
  install로 손상된 `node_modules/@types/node/inspector.generated.d.ts`의
  `Unterminated string literal`에서 중단됨
- 모바일 v10 실기기에서의 cold-cache/return-navigation 검증은 새 JS가 배포된 뒤
  수행 필요

## 영향

- 모바일에서 Canva 링크를 미디어로 표시하는 카드가 영향 대상이다.
- 특히 서버가 상대 `/api/canva/thumbnail` URL을 반환하는 카드와
  `linkImage=null`인 레거시 카드에서 재현 가능성이 높다.
- 웹은 브라우저가 상대 URL을 현재 origin에 대해 해석하므로 같은 데이터로도 정상
  표시될 수 있다.
- Canva 링크 자체 및 WebView 외부 열기 기능은 동작하므로 전체 기능 중단은 아니고
  초기 미디어 미리보기의 기능 저하다.
- 카드 데이터 손실이나 보안 영향은 확인되지 않았다.

## 재발 방지

- 모바일 카드 미디어의 모든 preview URL은 `buildMediaItems()` / 공통 asset resolver
  한 곳을 통해 native-resolvable absolute URL로 변환한다. 개별 컴포넌트에서
  상대 URL을 직접 `expo-image`에 넘기지 않는다.
- Canva 디자인은 저장 당시의 `linkImage`를 영구 진실값으로 간주하지 않는다.
  design URL이 있으면 Aura Board thumbnail proxy에서 재생성 가능한 파생값으로
  취급한다.
- 프리페치와 렌더는 반드시 같은 normalized URL을 사용한다. 각각 별도 URL 생성
  코드를 만들지 않는다.
- Canva 모바일 회귀 확인 시 아래 4개 데이터를 모두 확인한다.
  1. 신규 카드 + 정상 `linkImage`
  2. 상대 `/api/canva/thumbnail` `linkImage`
  3. `linkImage=null` 레거시 카드
  4. attachment `kind=link`의 상대 `previewUrl`
- 실기기 검증은 앱 이미지 캐시가 없는 상태에서 보드에 처음 진입해 Canva를 열기
  전에 썸네일이 보이는지 확인한다.
- Canva를 열고 뒤로 돌아온 뒤에도 같은 썸네일이 즉시 표시되는지 확인한다.
- 서버 Canva 계약 테스트와 모바일 소비 계약 테스트를 별개로 취급한다. 서버 route
  `200 image/*`만으로 모바일 정상 동작을 판정하지 않는다.

## 상세

- 선행 관련 인시던트:
  [`2026-08-13-canva-thumbnail-screen-regression.md`](./2026-08-13-canva-thumbnail-screen-regression.md)
- 모바일 media helper 최초 계보: `e11600c1` (`2026-06-16`)
- 모바일 보드 preview prefetch 도입: `e5972e3c` (`2026-08-04`)
- 서버 `/screen` thumbnail 수정: `d78e63f4` (`2026-08-13` 인시던트 관련)
- 이번 수정은 아직 커밋/배포 전이므로 최종 commit SHA와 모바일 배포 식별자는
  실기기 검증 후 이 문서에 추가한다.
