# APK 빌드 1회성 셋업

GitHub Actions 가 자동으로 APK 를 빌드하려면 사용자가 **한 번만** 해야 할 설정.

## 1. Expo 계정 + 프로젝트 등록

### 1-1. Expo 계정 생성 (이미 있으면 스킵)
https://expo.dev/signup 또는 `npx expo login` 으로 로그인

### 1-2. EAS 프로젝트 초기화 (로컬 우분투에서 1회)

```bash
cd apps/mobile
npm install -g eas-cli
eas login                      # expo 계정 자격 입력
eas init                       # 대화형으로 projectId 발급 + app.config.ts 자동 갱신
```

- `eas init` 이 `app.config.ts` 의 `extra.eas.projectId` 와 `updates.url` 의
  `REPLACE_WITH_EAS_PROJECT_ID` 두 곳을 자동 교체
- 이 변경을 commit + push (workflow 가 이 값을 읽음)

### 1-3. Access Token 발급 + GitHub secret 등록

1. https://expo.dev/accounts/<사용자명>/settings/access-tokens
2. "Create Token" → 이름 `github-actions` → 복사
3. GitHub repo > **Settings** > **Secrets and variables** > **Actions**
4. **New repository secret**:
   - Name: `EXPO_TOKEN`
   - Value: (붙여넣기)

## 2. 첫 빌드 트리거

두 가지 방법:

### 2-A. Actions 탭에서 수동 실행
1. GitHub repo > **Actions** > **Mobile APK Build (EAS Preview)**
2. **Run workflow** → 브랜치 `main` → **Run workflow**

### 2-B. apps/mobile/ 에 커밋 푸시
- `apps/mobile/` 아래 파일 변경 시 자동 트리거

## 3. 결과 확인

- Actions 실행 페이지의 **Summary** 탭에 빌드 URL (`https://expo.dev/.../builds/...`)
- 또는 https://expo.dev 대시보드 > 본인 프로젝트 > Builds
- 빌드 완료 (10-20분) 후 해당 페이지에서 **APK 다운로드**
- 다운로드 후 Galaxy Tab S6 Lite 에 설치:
  - USB: `adb install path/to/app.apk`
  - 또는 태블릿 브라우저로 URL 직접 열어 다운로드 → 설치 (출처 허용 필요)

## 4. 로컬에서 수동 빌드 (선택)

GitHub Actions 없이도 로컬 우분투에서:

```bash
cd apps/mobile
eas build --platform android --profile preview
# 빌드 완료 시 expo.dev APK URL 자동 출력
```

## 트러블슈팅

| 증상 | 원인 / 조치 |
|---|---|
| `::error:: EXPO_TOKEN secret이 설정되지 않았습니다` | 1-3 단계 secret 추가 누락 |
| `REPLACE_WITH_EAS_PROJECT_ID 가 남아있습니다` | 1-2 의 `eas init` 안 했거나 커밋 빼먹음 |
| `Build failed: Gradle build failed` | expo-router 플러그인 호환 이슈 — SDK 버전 확인, `npx expo-doctor` 실행 |
| APK 설치 시 "출처 허용 안 됨" | 태블릿 설정 > 앱 > 브라우저 > 출처 허용 토글 |
| "This app is not compatible with your device" | Tab S6 Lite 가 Android 13 이상인지 확인. Aura-board 는 API 33 이상 |
