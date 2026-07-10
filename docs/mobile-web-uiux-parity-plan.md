# Mobile-Web UI/UX Parity Plan

Updated: 2026-07-10

## Goal and scope

학생·학부모가 웹과 Expo 앱에서 같은 기능, 정보 구조, 디자인 언어, 상태 피드백, 권한 결과를 경험하게 한다. 관리자/교사 전용 화면과 개발 기능은 범위에서 제외한다.

웹과 모바일은 픽셀을 강제로 같게 만드는 대신 다음 계약을 공유한다.

- 같은 서버 데이터와 학생/학부모 권한 판정
- 같은 메뉴 이름과 핵심 작업 순서
- 같은 로딩·빈 상태·오류·완료·세션 만료 결과
- 같은 Noto Sans KR 타이포그래피와 Aura 색상/표면 토큰
- 휴대폰은 세로 밀도, 태블릿은 웹과 가까운 다열 밀도
- 저장 작업은 응답 성공뿐 아니라 재조회 후 서버 상태까지 일치

## Implemented parity

### Shared student contract

- 웹 `/student`와 모바일 `/api/student/me`는 `src/lib/student-home.ts`의 동일 DTO builder를 사용한다.
- 보드 category, 수업/놀이 구분, 과제 todo, `reminderSentAt`, 퀴즈·꼬들·스피드게임·그림자연합·모둠 상태를 한 계약으로 반환한다.
- 모바일은 보드/포트폴리오/통장/독서/Canva/알림과 학생 역할 화면을 제공한다.
- 웹에서 제거된 자랑해요와 프로덕션에서 숨긴 캐릭터/독서왕 기능은 모바일에서도 제거했다.

### Student board layouts

18개 프로덕션 레이아웃을 모바일 dispatcher에 연결했다. 카드·과제·퀴즈·식물·DJ·Vibe 계열뿐 아니라 질문, 수행평가, 꼬들, 스피드게임, 행사 신청, 모둠, 그림, 그림자연합도 실제 API와 권한 상태를 사용한다.

- 스피드게임은 미래 단어와 현재 추리자의 단어를 학생 응답에서 제거한다.
- 모둠 보드는 서버에서 본인/공유 섹션에만 쓰기를 허용하고, 열람 가능한 타 모둠과 쓰기 가능한 섹션을 구분한다.
- 행사 신청은 앱 내부 WebView에서 동일 웹 신청 흐름을 사용하고 API origin 밖의 이동을 차단한다.
- 그림자연합은 인증된 학생에게만 서버의 공개 Realtime 설정을 전달한다.

### Student notifications and roles

- 좋아요·댓글 알림: 60초 polling, foreground/path refresh, 배지, pull-to-refresh, 개별/전체 읽음.
- 청소/실내화 검사: 역할 기반 진입, 명단 상태, 저장, 청소 사진 업로드·재시도·제거.
- 독서 기록과 Canva 연결 코드는 웹·모바일이 같은 API/helper를 사용한다.

### Parent parity

- 웹·모바일 모두 `홈 / 알림 / 추가 / 계정` 4개 정보 구조를 사용한다.
- 학부모 홈은 동일한 자녀 피드 작성자/익명/첨부 표현 규칙을 사용한다.
- 모바일은 마지막 선택 자녀를 보존하고 휴대폰 full-bleed/태블릿 제한 폭을 적용한다.
- 알림에서 승인 대기·만료·신청 취소를 제공한다.
- 계정에서 연결 해제, 서버 세션 로그아웃, 탈퇴를 제공한다.
- 웹·모바일 세션 watchdog은 foreground와 45초 주기로 같은 익명/만료 계약을 확인한다.

## Acceptance gates

1. `npm run typecheck`
2. `npm run test`
3. `npm run build`
4. `cd apps/mobile && npm run typecheck`
5. `cd apps/mobile && npm run design:check`
6. `cd apps/mobile && npx expo export --platform android --clear`
7. 학생 코드 `DCY366`으로 웹과 Expo 로그인, 홈·알림·독서·Canva·보드 진입 확인
8. 학부모 로그인/연결/알림/계정 흐름 확인
9. 휴대폰 390px, 태블릿 768/1024px, 데스크톱 1440px에서 오버플로·상태·내비게이션 확인
10. 최종 커밋 푸시 후 프로덕션 서버가 같은 커밋을 배포했는지 확인
11. EAS production AAB의 git commit, versionCode, 다운로드 artifact 확인
12. Google Play production track 업로드와 출시 상태 확인

세부 검증 원칙은 `docs/verification-checklist.md`, 컴포넌트 경계는 `docs/mobile-component-mapping.md`, 디자인 토큰 규칙은 `docs/mobile-ui-parity.md`를 따른다.

## 2026-07-10 local evidence

- 현재 학생 fixture `DCY366`으로 웹과 Expo 로그인을 확인했다.
- 웹 390 x 844: `output/playwright/student-web-390.png`
- Expo 390 x 844: `output/playwright/student-expo-390.png`
- Expo 1024 x 768: `output/playwright/student-expo-1024.png`
- 양쪽 모두 같은 학생/학급, 미제출 과제 7건, `알림 7/2`, 수업 11개, 놀이 3개를 표시했다.
- Expo에서 알림, 독서, Canva 코드, 실제 columns 보드를 열었고 애플리케이션 콘솔 오류는 없었다.
- 로컬 Android SDK/ADB가 없어 Expo web과 Android Metro export로 검증했다. 네이티브 컴파일은 signed EAS production AAB가 최종 gate다.
