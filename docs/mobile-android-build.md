# Mobile Android Build Pipeline

Updated: 2026-06-27

Aura Board 모바일 앱의 Android APK/AAB 빌드는 Expo 소스를 직접 네이티브
프로젝트처럼 관리하지 않고, 전용 ASCII 빌드 디렉터리에서 재현 가능하게
생성한다.

## Core Rule

모바일 앱마다 전용 ASCII 빌드 디렉터리 하나를 사용한다.

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

또한 Android `local.properties`의 `sdk.dir`는 `C:/Android/Sdk`처럼 forward
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
6. Prints artifact paths, sizes, hashes, and version metadata.

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
