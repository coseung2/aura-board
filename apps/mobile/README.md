# Aura-board Mobile (Expo)

학생과 학부모가 웹과 같은 데이터·권한 계약을 사용하는 Expo 앱입니다. 휴대폰과 Galaxy Tab 계열 가로 화면을 모두 지원하며, 프로덕션 API는 `https://aura-board.com`을 사용합니다.

웹과 모바일은 같은 제품이지만 같은 화면 구조를 강제하지 않습니다. 모바일에서는 카드와 모달을 축소 복제하는 대신 `전체 상황 파악 → 항목 선택 → 상세 작업` 순서로 정보를 재구성합니다. 자세한 원칙은 [`docs/information-density.md`](./docs/information-density.md)를 참고합니다.

## 사용자 경험

### 학생

- 학생 코드 로그인과 Bearer 세션 저장
- 보드, 포트폴리오, 통장, 독서, 걷기, Canva, 알림 내비게이션
- 보드 허브에서 진행 중 활동·수업·놀이 상태와 카드 수 비교
- 일반 카드 보드의 압축 목록과 전체 카드 보기 전환
- 주제별 보드의 전체 주제 개요와 선택 주제 집중 보기
- 좋아요·댓글 알림 배지, 개별/전체 읽음, foreground 갱신
- 과제 알림 상태를 웹과 같은 `reminderSentAt` 규칙으로 표시
- 은행원·상점·검사·청소·실내화 역할 화면
- 청소 사진 선택·업로드·미리보기·교체·삭제
- 웹에만 남아 있는 개발용 캐릭터/독서왕 화면과 제거된 자랑해요 화면은 노출하지 않음

### 학부모

- 이메일 매직링크 및 Google/Kakao OAuth 로그인, 앱 딥링크 콜백
- `홈 / 알림 / 추가 / 계정` 4탭
- 자녀별 인스타그램형 피드, 첨부 상세, 마지막 선택 자녀 보존
- 연결 신청 상태·만료일 확인, 신청 취소, 연결 해제
- 서버 세션 로그아웃, 세션 만료 감지, 계정 탈퇴

## 학생 보드 레이아웃

| 레이아웃 | 모바일 구현 |
|---|---|
| `freeform`, `grid`, `stream` | 압축 목록 기본, 카드 보기 전환, 검색·필터, 작성·첨부·상세·수정/삭제 |
| `columns` | 전체 주제 개요, 주제별 활동량 비교, 선택 주제 카드 목록과 작성 |
| `assignment` | 과제 확인과 텍스트·이미지·파일 제출 |
| `quiz` | 방 참가, 문제 진행, 결과 |
| `drawing` | 네이티브 드로잉, 저장, 학급 갤러리 |
| `breakout` | 본인/공유 모둠 작성 권한과 열 탐색 |
| `assessment` | 응시, 답안 저장, 타이머, 최종 제출 |
| `dj-queue` | 신청, 대기열, 상태, DJ 권한 |
| `vibe-arcade` | AI 코딩과 인증된 샌드박스 실행 |
| `vibe-gallery` | 승인 작품 갤러리와 인증 실행 |
| `kordle` | 시도 생성, 추리, 상태 갱신, 결과 |
| `speed-game` | 역할별 단어/추리, 답 제출, 순위 |
| `shadow-alliance` | Realtime 참가, 라운드 제출, 결과 |
| `plant-roadmap` | 성장 단계와 관찰 기록 |
| `event-signup` | 앱 내부의 동일 웹 신청 화면 |
| `question-board` | 질문·응답 조회와 응답 제출 |

## 로컬 실행과 검증

```powershell
cd apps/mobile
npm install
npm run typecheck
npm run design:check
npx expo start
```

API 주소를 바꾸려면 gitignored `.env`에 다음 값을 지정합니다.

```dotenv
EXPO_PUBLIC_API_BASE=https://example.test
```

Shadow Alliance는 빌드에 Supabase 값을 하드코딩하지 않습니다. 인증된 학생 앱이 `/api/student/realtime-config`에서 공개 Realtime 설정을 받아 사용하며, 설정이 없는 서버에서는 명시적인 사용 불가 상태를 표시합니다.

## Android 출시

프로덕션은 EAS 원격 버전을 사용하고 AAB의 `versionCode`를 자동 증가시킵니다.

```powershell
npx eas-cli@latest build -p android --profile production --non-interactive --wait
npx eas-cli@latest submit -p android --profile production --id <BUILD_ID> --non-interactive --wait
```

Google Play 첫 업로드 또는 서비스 계정 미설정 상태에서는 Play Console에서 AAB를 수동 업로드한 뒤 프로덕션 출시를 완료합니다. 로컬 Gradle 빌드는 `../../docs/mobile-android-build.md`를 따릅니다.

## 설계 규칙

- 색상·간격·타이포그래피·크기는 `theme/tokens.ts`를 사용합니다.
- 공용 컨트롤은 `components/ui.tsx`, 레이아웃 기능은 `components/layouts/*`에 둡니다.
- 화면 파일은 라우팅과 데이터 조합만 담당합니다.
- 네트워크 요청은 `lib/api.ts`의 Bearer 인증과 공통 오류 처리를 사용합니다.
- 넓은 화면의 정보량은 모바일에서 요약·필터·단계화로 보존합니다.
- 변경 후 `npm run design:check`를 반드시 통과시킵니다.
