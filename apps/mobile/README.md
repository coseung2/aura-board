# Aura-board Mobile (Expo)

학생 태블릿(Galaxy Tab S6 Lite 가로 2000×1200) 우선 타겟. **실제 프로덕션 API 연동됨.**

## 📦 APK 받기 (실기기 테스트)

GitHub Actions 가 자동으로 APK 를 빌드한다. 최초 1회 셋업은 [SETUP.md](./SETUP.md) 참조.

- 설정 완료 후: main 에 `apps/mobile/` 커밋이 들어가면 자동 빌드
- 또는 GitHub > Actions > **Mobile APK Build (EAS Preview)** > Run workflow
- 10-20분 뒤 expo.dev 에서 APK 다운로드 → 태블릿에 설치 → 교사가 발급한 6자리 코드로 로그인

## 로컬 Android 빌드 (APK/AAB)

로컬 릴리스 빌드는 repo 안의 `android/`를 직접 빌드 기준으로 삼지 않고,
전용 ASCII 빌드 디렉터리에서 Expo prebuild를 재생성하는 파이프라인을 사용한다.
상세 규칙은 `../../docs/mobile-android-build.md` 참고.

APK:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "..\..\.codex\scripts\build-android.ps1" `
  -AppSource "." `
  -BuildDir "C:\build-aura-board-android" `
  -ForcePrebuild `
  -Output Apk
```

APK + AAB:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "..\..\.codex\scripts\build-android.ps1" `
  -AppSource "." `
  -BuildDir "C:\build-aura-board-android" `
  -ForcePrebuild `
  -Output Both
```

Play Store용 AAB는 빌드 전에 `app.config.ts`의 `android.versionCode`를
증가시킨다.

## 기본 동작

### 학생 (Student)
- 랜딩 → 학생 선택 → 로그인 화면
- 로그인: `POST /api/student/auth { token }` → `sessionToken` 을 SecureStore 에 AES 로 저장.
- 모든 후속 요청: `Authorization: Bearer <token>` 헤더. 쿠키 X.
- 대시보드: `GET /api/student/me` → 학급 + 보드 목록.
- 보드 상세: `GET /api/student/board/[slug]` → layout 에 맞는 네이티브 화면 분기.

### 학부모 (Parent)
- 랜딩 → 학부모 선택 → 이메일 입력
- 로그인: `POST /api/parent/signup { email, client: "mobile" }` → 이메일로 매직링크 발송
- 매직링크 콜백: `auraboard://parent/auth/callback#token=<token>&expiresAt=<ISO>`
  - 앱이 cold/foreground 상태일 때 모두 딥링크로 처리해 `parentToken` 을 SecureStore 에 저장 후 `/(parent)` 이동
  - `#error=<code>` 는 기존 학부모 세션을 클리어하고 로그인 화면에 에러 노출
- 개발/QA 환경에서는 API 응답의 `devMagicLinkUrl` 로 메일 없이 바로 콜백 테스트 가능
- 모든 후속 학부모 요청: `Authorization: Bearer <parentToken>` 헤더.
- 대시보드: `GET /api/parent/children` → active 자녀 목록.
- 자녀 연결: `/(parent)/link-child` → `POST /api/parent/match/code` →
  `GET /api/parent/match/students` → `POST /api/parent/match/request`
- 자녀 상세: 자녀의 보드/활동 목록.

## API Base URL 설정

`EXPO_PUBLIC_API_BASE` 환경변수로 서버를 지정. `eas.json` 의 각 profile `env` 에 박혀있고,
로컬 개발 시에만 `.env` 로 override:

```bash
# apps/mobile/.env (gitignored)
EXPO_PUBLIC_API_BASE=https://aura-board-app.vercel.app
# 또는 로컬 next dev tunnel:
# EXPO_PUBLIC_API_BASE=https://<your-ngrok>.ngrok-free.dev
```

기본값은 `https://aura-board-app.vercel.app` (프로덕션).

## 지원 레이아웃 (14개)

| Layout | 네이티브 구현 | 상세 |
|---|---|---|
| `freeform` / `grid` / `stream` | ✅ CardsBoard | 카드 작성(이미지·파일 업로드) + 그리드 뷰 |
| `columns` | ✅ ColumnsBoard | 주제별 세로 칼럼 + 카드 추가 |
| `vibe-arcade` | ✅ VibeArcadeBoard | AI 채팅(SSE 스트리밍) + WebView 샌드박스 재생 |
| `quiz` | ✅ QuizBoard | 방 코드 참가 → 문제 풀기 → 리더보드 |
| `assignment` | ✅ AssignmentBoard | 내 슬롯 + 텍스트·이미지·파일 제출 + 반 전체 현황 |
| `plant-roadmap` | ✅ PlantRoadmapBoard | 성장 단계 + 관찰 일지 타임라인 (읽기) |
| `vibe-gallery` / `dj-queue` / `event-signup` / `breakout` / `assessment` / `drawing` | 🟡 ReadOnlyCardsBoard | 네이티브 카드 뷰 (쓰기는 후속) |

## 빠른 실행 (Android 에뮬레이터, 로컬 dev)

```
cd apps/mobile
npm run android
```

- Expo Go (SDK 54) 가 설치된 에뮬레이터/실기기가 자동 감지됨
- 코드 수정 시 Fast Refresh 로 즉시 반영
- `expo-secure-store` / `expo-camera` 같은 native 모듈이 붙은 뒤로는 Expo Go 만으로는 부족 →
  Dev Client 빌드가 필요할 수 있음 (아래 참조)

### 에뮬레이터 권장 AVD

- Device: **Galaxy Tab S6 Lite** (또는 Pixel Tablet / 10.4" 커스텀)
- Resolution: 2000 × 1200
- Orientation: **Landscape**
- Android 13+ 권장

## Dev 빌드

네이티브 모듈이 추가되어 Expo Go 에서 안 돌 때:

```
npx eas login             # 최초 1회
npx eas build:configure   # EAS 프로필 생성
npx eas build --profile development --platform android
```

- 빌드된 APK 를 에뮬레이터에 drag-drop 설치
- 이후 `npm start` → 에뮬레이터의 Aura-board Dev 앱 실행 → JS 변경 즉시 반영
- 네이티브 모듈 추가 시에만 재빌드 필요

## 디자인 토큰

`theme/tokens.ts` 에 웹 `src/styles/base.css` 의 CSS 변수를 포팅합니다.
색, 반경, 그림자, 고정 크기는 화면 파일에 직접 쓰지 않고 토큰 또는 공통 UI 컴포넌트를 통해 사용합니다.
양쪽 동기화는 추후 `packages/shared/` 추출 대상.

## 폴더 구조

```
apps/mobile/
├── app.config.ts          # Expo 설정, theme/tokens.ts 기준값 참조
├── eas.json               # profile 별 EXPO_PUBLIC_API_BASE 주입
├── app/                   # expo-router file-based
│   ├── _layout.tsx        # 루트 레이아웃 (SafeAreaProvider + Stack)
│   ├── index.tsx          # 랜딩 — 학생/학부모 역할 선택
│   ├── (student)/         # 학생 route group
│   │   ├── _layout.tsx
│   │   ├── login.tsx      # 6자리 코드 로그인 + 기존 세션 자동 복구
│   │   ├── index.tsx      # 학생 대시보드 (/api/student/me)
│   │   └── board/[slug].tsx  # layout dispatcher
│   └── (parent)/          # 학부모 route group
│       ├── _layout.tsx
│       ├── login.tsx      # 학부모 이메일 매직링크 로그인
│       ├── index.tsx      # 학부모 대시보드 — 자녀 목록
│       └── child/[id].tsx # 자녀 상세 — 보드 목록
├── components/
│   ├── BoardShell.tsx     # 공통 헤더
│   ├── CardView.tsx       # 카드 하나 렌더
│   ├── CardComposer.tsx   # 카드 작성 모달 + 이미지/파일 업로드
│   └── layouts/
│       ├── CardsBoard.tsx        # freeform/grid/stream
│       ├── ColumnsBoard.tsx      # columns
│       ├── VibeArcadeBoard.tsx   # vibe-arcade (SSE + WebView)
│       ├── QuizBoard.tsx         # quiz (polling)
│       ├── AssignmentBoard.tsx   # assignment (file upload)
│       ├── PlantRoadmapBoard.tsx # plant-roadmap
│       └── ReadOnlyCardsBoard.tsx
├── lib/
│   ├── api.ts             # fetch 래퍼 + SSE parser
│   ├── session.ts         # SecureStore wrapper (학생 + 학부모)
│   └── types.ts           # 서버 DTO 사본 (학생 + 학부모)
├── theme/
│   ├── tokens.ts
│   └── layout-meta.ts
└── assets/
```

## 후속 작업

- [x] 학부모 자녀 연결 플로우 네이티브화 (code → students → request)
- [ ] expo-camera → QR 스캐너 실동작 (Dev Client 필요)
- [ ] vibe-gallery / dj-queue / event-signup / breakout / assessment / drawing 네이티브 쓰기 모드
- [ ] 드로잉(Canvas) — `react-native-skia` 또는 SVG
- [ ] 웹과 shared 토큰 모듈 추출 (`packages/shared-tokens`)
- [ ] Deep link: `auraboard://board/xxx`
- [ ] Push notification (교사 승인/퀴즈 알림) — expo-notifications
