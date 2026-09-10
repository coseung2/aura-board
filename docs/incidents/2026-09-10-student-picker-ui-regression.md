# 학생 랜덤뽑기 패널 높이·접근성 회귀

- 일시: 2026-09-10 22:50–23:20 KST (Asia/Seoul).
- 증상·영향: 툴킷 학생 랜덤뽑기 패널이 낮은 창 높이에서 화면 위쪽으로 잘렸고, 뽑는 중에는 95ms마다 바뀌는 이름이 라이브 영역 안에서 갱신됐다. 동작 축소 설정에서도 스포트라이트 확대·축소와 카드 점프가 그대로 재생됐고, 인원·대상·닫기 버튼이 44px 터치 크기에 미달했다. 저장 데이터나 추첨 결과 손상은 없다.
- 확인 원인: 높이 상한 `min(760px, 100vh - 96px)`가 실제 하단 오프셋(`--fab-bottom-safe` 32px + 72px = 104px)과 상단 여백을 반영하지 않아, 상한에 걸리는 창 높이에서 패널 top이 음수가 됐다(측정값 -8px, 모바일 -6px). 스포트라이트 컨테이너에 `aria-live="polite"`가 붙어 있어 하이라이트 이름이 바뀔 때마다 라이브 영역 내용이 갱신됐고, 결과 요약에도 두 번째 라이브 영역이 있었다. 보조기기 낭독 큐는 실측하지 않았으므로 이 부분은 알림이 반복될 위험으로 본다. `prefers-reduced-motion` 처리가 없었고, 스테퍼·세그먼트·닫기 버튼 크기가 38/42/32px로 고정돼 있었다.
- 대응: 패널 높이 상한을 `--picker-bottom-offset`(FAB 안전영역 + 72px, ≤640px에서는 + 66px)과 `--picker-top-margin`(24px, 모바일 20px)에서 계산하도록 바꾸고 `100dvh` 기준으로 맞췄다. 하단 위치도 같은 변수를 쓰게 해 상한과 배치가 함께 움직인다. 스포트라이트·요약의 `aria-live`를 제거하고, 진행 중에는 "학생을 뽑고 있어요.", 확정 후에는 번호·이름 목록을 알리는 `sr-only` `role="status"` 영역 하나만 남겼다. 동작 축소 미디어 쿼리에서 로딩 스피너·스포트라이트 펄스 애니메이션과 카드/버튼 트랜스폼을 껐고, 추첨 난수와 95ms 순환 로직은 그대로 두었다. 스테퍼·세그먼트·닫기 버튼은 `--tap-min`(44px)을 사용한다. 승인된 디자인(색상, 히어로, 진행 표시, 카드 레이아웃)은 유지했다.
- 검증: 실제 컴포넌트와 실제 CSS를 헤드리스 Chrome iframe 뷰포트에서 렌더링해 기하값을 측정했다(HEAD CSS와 수정 CSS 비교). 390×844 top -6 → 20, 768×600 top -8 → 24, 1440×700 top -8 → 24, 700×900·1440×1000은 36/136 유지, 모든 뷰포트에서 패널 내부 스크롤 유지. 터치 크기는 스테퍼 38×52 → 44×54, 세그먼트 높이 42 → 52, 닫기 32×32 → 44×44. `--force-prefers-reduced-motion`으로 실행한 동일 프로브에서 스포트라이트 `animation-name` `boardPickerPulse` → `none`, 하이라이트 카드 transform `matrix(1.07…, -3)` → `none`을 확인했고, 동작 축소가 아닐 때는 기존 애니메이션이 그대로 남는 것도 확인했다.
- 검사: `npx vitest run src/components/toolkit/StudentRandomPickerPanel.vitest.tsx` 6개 통과(라이브 영역 회귀 2개 신규, 수정 전 코드에서는 실패). `npm run check:lines` 통과, `git diff --check` 공백 오류 없음. 루트 `typecheck`는 조정자가 통합 실행한다.
- 재현 방법: 기하·동작 축소 프로브는 무시되는 `tmp/` 경로의 일회용 스크립트 `tmp/picker-geometry.mjs`(엔트리 `tmp/picker-geometry-entry.tsx`)이다. 수정본은 `node tmp/picker-geometry.mjs`, HEAD 기준선은 `node tmp/picker-geometry.mjs baseline`, 동작 축소 비교는 `PICKER_REDUCED_MOTION=1`을 설정하고 같은 명령을 실행한다(PowerShell: `$env:PICKER_REDUCED_MOTION="1"`). 측정 결과는 `tmp/geometry-baseline.json`, `tmp/geometry-working.json`, `tmp/geometry-rm-baseline.json`, `tmp/geometry-rm-working.json`에 있다.
- 범위·후속: CSS·컴포넌트·테스트·문서만 수정했고 백엔드·배포 변경은 없다. 프로브는 실제 컴포넌트와 실제 CSS를 iframe 뷰포트에서 렌더링한 측정값이지만, 실제 보드 페이지 전체 레이아웃이나 로그인 세션에서의 확인은 포함하지 않았다. 라이브 영역 변경은 DOM 구조 기준으로만 검증했고 스크린 리더 낭독 큐 실측은 하지 않았다. `npm run check:css-shards`는 HEAD와 CSS가 같아야 통과하는 검사여서 의도한 이번 변경을 실패로 보고하며, 기준이나 검사기는 수정하지 않았다.

## 후속 검증 2026-09-11 (Asia/Seoul): 태블릿 세로·가로 회전

- 목적: 위 수정이 태블릿 가로·세로 양쪽에서 유지되는지, 그리고 회전이 이미 마운트된 패널의 선택 상태를 보존하는지 확인한다. 새 제품 수정은 하지 않았고, 실패가 확인되지 않아 CSS·컴포넌트 변경도 추가하지 않았다.
- 방법: 기존 일회용 프로브를 확장했다(`node tmp/picker-geometry.mjs orientation`). 엔트리 `tmp/picker-geometry-entry.tsx`는 `BoardTimerFab`의 소유 상태(성별 필터 규칙, 인원 clamp)를 그대로 옮긴 하네스로 감싸, 교사가 실제로 하는 조작(학급 `2학년 3반` 선택 → `여학생` → 인원 2→4 → 뽑기)을 실행한 뒤 같은 React 트리를 유지한 채 iframe 크기만 바꿔 회전시킨다. 새로 마운트하는 방식이 아니다. 추첨 난수 자체는 `BoardTimerFab`에 있고 이 프로브 범위가 아니므로 하네스의 뽑기는 결정적이다.
- 프로브 CSS 수정: 초기 실행에서 패널 하단에 가로 스크롤바가 보였고 `scrollWidth 642 / clientWidth 628`(스크롤바 억제 시 652/638)로 14px 스크롤 범위가 잡혔다. 원인은 제품 CSS가 아니라 프로브가 앱 전역 리셋을 주입하지 않은 것이었다. `src/styles/base.css`의 `* { box-sizing: border-box }`가 없으면 `.board-picker-progress`의 `width: calc(100% - 48px)` 위에 padding 6px과 border 1px이 더해진다. `base.css`를 프로브의 공용 CSS 목록에 추가한 뒤 모든 뷰포트에서 `scrollWidth === clientWidth`, `scrollLeft` 최대값 0으로 바뀌었다. `overflow-x: hidden`으로 가리는 방식은 쓰지 않았다.
- 측정값(수정 CSS, 회전 전/후 동일 인스턴스):

| 회전 쌍 | 세로 | 가로 |
| --- | --- | --- |
| 800×1280 ↔ 1280×800 | top 416, 하단여백 104, 높이 760(max 760px), 내부 스크롤 999/758 | top 24, 하단여백 104, 높이 672(max 672px), 999/670 |
| 768×1024 ↔ 1024×768 | top 160, 하단여백 104, 높이 760(max 760px), 998/758 | top 24, 하단여백 104, 높이 640(max 640px), 999/638 |
| 430×932 ↔ 932×430 | top 74, 하단여백 98, 높이 760(max 760px), 1115/758 | top 24, 하단여백 104, 높이 302(max 302px), 999/300 |

- 가로 넘침: 6개 뷰포트 모두 패널 `scrollWidth === clientWidth`(628/628, 좁은 세로에서 379/379), 패널 `scrollLeft`를 최대로 밀어도 0, 문서 `scrollWidth`가 뷰포트 폭보다 작다(예: 1280 뷰포트에서 1265). 패널 내부 최우측 요소는 `.board-picker-hero`로 콘텐츠 박스 경계와 정확히 일치(초과 0px)한다.
- 도달성: 패널 자체 세로 스크롤만으로 닫기(위쪽, `scrollTop 0`)와 뽑기 버튼·결과 요약(아래쪽, `scrollTop` 240–699)이 패널과 뷰포트 안에 완전히 들어온다. 932×430처럼 짧고 넓은 창에서도 `scrollTop 699`에서 `한 번 더 뽑기`와 `선택 결과` 칩이 모두 보인다(스크린샷 `tmp/picker-orientation/*-scrolled-bottom.png`).
- 터치 크기: 6개 뷰포트 모두 스테퍼·세그먼트·닫기·학급 select·뽑기 버튼의 최소 변이 44px 이상이다(닫기 44×44, 스테퍼 44×54, 세그먼트 79.66×52 / 세로 좁은 화면 106.66×52, select 폭×44, 뽑기 버튼 높이 52).
- 상태 보존: 세 쌍 모두 `stateRetained true`. 회전 전후로 학급 `2학년 3반 · 28명`(value `c2`), 대상 `여학생`, 인원 `4`, 명단 카드 14장, 선택 표시 4장, 스포트라이트 `4명 선택 완료`, 요약 `1번 학생1 / 3번 학생3 / 5번 학생5 / 7번 학생7`, 버튼 라벨 `한 번 더 뽑기`가 동일하다.
- 산출물: 측정값 `tmp/orientation-working.json`, 스크린샷 `tmp/picker-orientation/`(뷰포트별 상단 뷰 6장 + `-scrolled-bottom` 6장).
- 검사: `npx vitest run src/components/toolkit/StudentRandomPickerPanel.vitest.tsx` 6개 통과. 루트 `typecheck`의 기존 은행 라우트 오류는 이번 범위와 무관하며 재실행하지 않았다.
- 한계: 실제 태블릿 기기에서의 확인은 하지 않았다. 브라우저 크롬(주소창 축소·확장)과 소프트 키보드가 뜬 상태의 레이아웃, 시스템 폰트 확대(1.3/2.0), 실제 보드 페이지 전체 레이아웃도 이 프로브에 포함되지 않는다. iframe 리사이즈는 레이아웃 뷰포트와 `dvh`에는 실제 회전과 같게 작동하지만 `orientationchange` 이벤트나 기기 회전 애니메이션을 대신하지는 않는다.
