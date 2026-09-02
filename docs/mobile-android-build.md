# Mobile Android Build Pipeline

Updated: 2026-06-27

Aura Board 모바일 앱의 Android APK/AAB 빌드는 Expo 소스를 직접 네이티브
프로젝트처럼 관리하지 않고, 전용 ASCII 빌드 디렉터리에서 재현 가능하게
생성한다.

## Core Rule

모바일 앱마다 전용 ASCII 빌드 디렉터리 하나를 사용한다. 아래의 `C:\build-...` 경로는 앱별 기본값이며, 다른 드라이브를 사용할 때 `-BuildDir`로 덮어쓸 수 있다.

| App | Source | Build directory |
|---|---|---|
| Aura Board | `apps/mobile` | `C:\build-aura-board-android` |
| Aura | `aura-mobile` | `C:\build-aura-android` |
| New apps | app source path | `C:\build-<app-slug>-android` |

빌드 디렉터리는 앱끼리 공유하지 않는다. 스크립트가 `robocopy /MIR`로 소스를
동기화하므로 공유 디렉터리는 다른 앱의 route, Gradle 설정, 산출물을 지울 수
있다.

## Why ASCII Build Directories

Windows 사용자 경로에 한글 등 non-ASCII 문자가 있으면 Expo prebuild, Node,
Gradle, Android SDK 도구가 사용자 홈이나 임시 디렉터리를 읽고 쓰다가 실패할
수 있다. 이 문제는 repo 경로만 ASCII로 복사해서는 충분하지 않다.

공통 스크립트는 빌드 전에 다음 경로를 모두 빌드 디렉터리 내부 ASCII 경로로
고정한다.

- `USERPROFILE`
- `HOME`
- `TEMP`
- `TMP`
- `GRADLE_USER_HOME`
- Java `user.home`

Android SDK는 `ANDROID_HOME`, `ANDROID_SDK_ROOT`, `%LOCALAPPDATA%\Android\Sdk`,
`C:\Android\Sdk` 순서로 자동 탐색하며, `-AndroidSdkRoot`로 덮어쓸 수 있다. 또한 Android `local.properties`의 `sdk.dir`는 `C:/Android/Sdk`처럼 forward
slash로 기록한다. Java properties 파일에서 `C:\Android\Sdk` 형태의 백슬래시는
escape 문자로 해석될 수 있다.

## Script

Use:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".codex\scripts\build-android.ps1" `
  -AppSource "apps\mobile" `
  -BuildDir "C:\build-aura-board-android" `
  -Output Apk
```

The script:

1. Mirrors the Expo app source into the build directory.
2. Installs dependencies with `npm ci` unless `-SkipNpmInstall` is passed.
3. Creates or regenerates `android\` inside the build directory.
4. Patches package name, version name, version code, signing, and SDK path.
5. Builds APK and/or AAB with Gradle.
6. Runs an app-provided `scripts/check-android-release.mjs` gate when present.
7. Prints artifact paths, sizes, hashes, and version metadata.

Aura Board ships this release gate. A signed release build fails unless all of
the following are true:

- Expo prebuild generated `android.enableMinifyInReleaseBuilds=true` and
  `android.enableShrinkResourcesInReleaseBuilds=true`.
- The generated app manifest is resizable and contains no orientation or
  min/max-aspect-ratio restrictions for large-screen devices.
- R8 generated a non-empty release `mapping.txt`.
- AAB `BundleConfig.pb` requests `PAGE_ALIGNMENT_16K` for uncompressed native
  libraries.
- every packaged native `.so` has ELF `PT_LOAD` alignment of at least 16 KB.
- APK output, when requested, passes `zipalign -c -P 16 -v 4`.

This makes the February 2027 Google Play DEX optimization requirement, the
large-screen manifest recommendations, and Android's 16 KB page-size
compatibility checks release-time failures instead of Play Console surprises.
The Play Console remains the source of truth for the reported optimization,
obfuscation, and shrinking percentages; R8 must reach at least 25% in all three
for apps whose DEX code exceeds Google's enforcement threshold.

### Play Console display recommendations

Aura Board also removes generated orientation/aspect-ratio restrictions and
sets the Android application as resizable through
`plugins/with-android-large-screen-support.js`. Do not edit the generated
`android/AndroidManifest.xml`; `-ForcePrebuild` must reproduce the same result.

The Play Console recommendation about deprecated edge-to-edge APIs can be
reported from compatibility code inside React Native or React Native Screens,
even when Aura Board does not call status/navigation bar color APIs directly.
Keep `edgeToEdgeEnabled: true`, stay on the Expo-recommended React Native/native
dependency versions, and re-check the warning after each store upload. Do not
patch generated framework sources solely to silence the static Play warning;
take the upstream Expo/React Native patch when the SDK supports it.

## Generated Native Mode

Aura Board does not keep `apps/mobile/android` as source of truth. Native
Android files are generated in the ASCII build directory just like Aura. Use
`-ForcePrebuild` when building so a stale generated `android\` directory in the
build directory is removed before Expo prebuild runs:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".codex\scripts\build-android.ps1" `
  -AppSource "apps\mobile" `
  -BuildDir "C:\build-aura-board-android" `
  -ForcePrebuild `
  -Output Both
```

`-ForcePrebuild` removes only `<BuildDir>\android` and regenerates it inside
the ASCII build directory. It does not touch app source files.

Use this as the default local release-build path unless custom native code is
intentionally added and documented.

## Common Commands

Prepare without Gradle:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".codex\scripts\build-android.ps1" `
  -AppSource "apps\mobile" `
  -BuildDir "C:\build-aura-board-android" `
  -ForcePrebuild `
  -PrepareOnly
```

Build APK:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".codex\scripts\build-android.ps1" `
  -AppSource "apps\mobile" `
  -BuildDir "C:\build-aura-board-android" `
  -ForcePrebuild `
  -Output Apk
```

Build APK and AAB:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".codex\scripts\build-android.ps1" `
  -AppSource "apps\mobile" `
  -BuildDir "C:\build-aura-board-android" `
  -ForcePrebuild `
  -Output Both
```

For Play Store upload, increment `android.versionCode` in the Expo config before
building `-Output Aab` or `-Output Both`.

## Outputs

APK:

```text
<BuildDir>\android\app\build\outputs\apk\release\app-release.apk
```

AAB:

```text
<BuildDir>\android\app\build\outputs\bundle\release\app-release.aab
```

Verify after each build:

```powershell
Get-Item -LiteralPath "<artifact>"
Get-FileHash -Algorithm SHA256 -LiteralPath "<artifact>"
& "C:\Android\Sdk\build-tools\36.0.0\aapt.exe" dump badging "<apk>"
```

## Mobile Version Policy

The mobile app checks `GET /api/mobile/version-policy` at launch and whenever
the app returns to the foreground. A version below the platform-specific
`MOBILE_ANDROID_LATEST_VERSION` or `MOBILE_IOS_LATEST_VERSION` gets an optional
update prompt. Leave those variables unset until the matching mobile build has
passed store review and is publicly available; when unset, the API does not
advertise a newer optional version. A version below
`MOBILE_MINIMUM_SUPPORTED_VERSION` gets a blocking update prompt.

Configure the deployed web/API environment only after releasing a mobile version:

```text
MOBILE_ANDROID_LATEST_VERSION=1.0.8
MOBILE_IOS_LATEST_VERSION=1.0.8
MOBILE_MINIMUM_SUPPORTED_VERSION=1.0.4
MOBILE_UPDATE_MESSAGE=더 안정적인 Aura Board를 사용하려면 최신 버전으로 업데이트해 주세요.
MOBILE_ANDROID_STORE_URL=https://play.google.com/store/apps/details?id=com.auraboard.app
MOBILE_IOS_STORE_URL=https://aura-board.com
```

Keep the minimum version at or below the latest version. The API rejects
malformed version strings and non-HTTPS store overrides by falling back to safe
defaults. Set the final iOS App Store URL before enforcing an iOS update.

## Verification Gate

After changing the pipeline or app config, first verify native generation
without Gradle:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".codex\scripts\build-android.ps1" `
  -AppSource "apps\mobile" `
  -BuildDir "C:\build-aura-board-android" `
  -ForcePrebuild `
  -PrepareOnly
```

Expected metadata:

- Package: `com.auraboard.app`
- Version: `0.1.0`
- Version code: from `android.versionCode`, or `1` if omitted.

For Aura Board, `-PrepareOnly` also runs the source/generation half of the Play
release gate and confirms that Expo prebuild has actually enabled R8 minify and
resource shrinking. Full APK/AAB alignment checks run after Gradle produces the
release artifacts.
