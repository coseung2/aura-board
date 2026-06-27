# Mobile Android Build Standard

This repository uses a shared local Android build pattern for Expo mobile apps.
Use this document before building APKs, AABs, or submitting Android releases.

## Core Rule

One mobile app gets one dedicated ASCII build directory.

- Aura: `C:\build-aura-android`
- Aura Board: `C:\build-aura-board-android`
- New apps: `C:\build-<app-slug>-android`

Never reuse a build directory across apps. `robocopy /MIR` deletes files that do
not exist in the source app, so sharing a build directory can erase another
app's routes, native package, Gradle config, or previous outputs.

## Shared Tooling

- Android SDK: `C:\Android\Sdk`
- Script: `.codex\scripts\build-android.ps1`
- Build root: ASCII path under `C:\build-...`
- Gradle/npm/temp state: isolated under each build directory by default

The script mirrors the app source into the build directory, installs node
dependencies, creates native Android files with Expo prebuild when needed,
patches Gradle package/version/signing values, then builds APK and/or AAB.

On Windows machines whose user profile path contains non-ASCII characters, the
script also binds `USERPROFILE`, `HOME`, `TEMP`, `TMP`, `GRADLE_USER_HOME`, and
Java `user.home` to directories inside the ASCII build directory before running
`npm ci`, `expo prebuild`, or Gradle. This is required because Expo/Node may
read or write user-home and temp paths even when the app source itself has been
mirrored to `C:\build-...`.

Use `-PrepareOnly` to stop after mirror/native preparation/Gradle patching
without running Gradle. This is the fastest way to validate that an app is
bound to the correct package, version, and build directory.

Use `-ForcePrebuild` when an app has a checked-in `android\` directory but the
shared build should use Expo-generated native files. This removes only
`<BuildDir>\android` and regenerates it inside the ASCII build directory; it
does not delete the source app's `android\` directory.

## Required App Files

Each Expo mobile app should have:

- `app.json` or `app.config.ts`
- `package.json`
- `package-lock.json`
- `credentials.json`
- `credentials\android\keystore.jks`

The app config must define:

- `name`
- `slug`
- `version`
- `scheme` when deep links are used
- `android.package`
- `android.versionCode` for Play Store/AAB uploads

For `app.config.ts`, if `android.versionCode` is omitted, the local script uses
`1`. For Play Store uploads, set and increment it explicitly before building.

## Aura Board Commands

APK:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".codex\scripts\build-android.ps1" `
  -AppSource "apps\mobile" `
  -BuildDir "C:\build-aura-board-android" `
  -ForcePrebuild `
  -Output Apk
```

APK + AAB:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".codex\scripts\build-android.ps1" `
  -AppSource "apps\mobile" `
  -BuildDir "C:\build-aura-board-android" `
  -ForcePrebuild `
  -Output Both
```

Prepare only:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".codex\scripts\build-android.ps1" `
  -AppSource "apps\mobile" `
  -BuildDir "C:\build-aura-board-android" `
  -ForcePrebuild `
  -PrepareOnly
```

Generated native mode, recommended for validating whether Aura Board can follow
the same architecture as Aura:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".codex\scripts\build-android.ps1" `
  -AppSource "apps\mobile" `
  -BuildDir "C:\build-aura-board-android" `
  -ForcePrebuild `
  -PrepareOnly
```

## Aura Commands

From `C:\Users\심보승\Desktop\Projects\aura`:

Aura currently keeps the Expo app in `aura-mobile` and does not keep a native
`aura-mobile\android` directory in source. The shared script therefore runs
Expo prebuild inside `C:\build-aura-android`, not inside the Korean-path repo.
Do not run prebuild directly in the repo path unless you are intentionally
debugging Expo native generation.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".codex\scripts\build-android.ps1" `
  -AppSource "aura-mobile" `
  -BuildDir "C:\build-aura-android" `
  -Output Apk
```

AAB for Play release:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".codex\scripts\build-android.ps1" `
  -AppSource "aura-mobile" `
  -BuildDir "C:\build-aura-android" `
  -Output Aab
```

Submit the generated AAB with EAS only after checking `versionCode`:

```powershell
npx eas-cli@latest submit -p android --profile production --path "C:\build-aura-android\android\app\build\outputs\bundle\release\app-release.aab" --non-interactive
```

The script also supports `-SubmitAndroid`, but manual review of the AAB path,
version, and hash is recommended before production upload.

## Outputs

APK:

```text
<BuildDir>\android\app\build\outputs\apk\release\app-release.apk
```

AAB:

```text
<BuildDir>\android\app\build\outputs\bundle\release\app-release.aab
```

Always verify after build:

```powershell
Get-Item -LiteralPath "<artifact>"
Get-FileHash -Algorithm SHA256 -LiteralPath "<artifact>"
```

For APK metadata:

```powershell
& "C:\Android\Sdk\build-tools\36.0.0\aapt.exe" dump badging "<apk>"
```

## Release Rules

- APK for local sharing: no Play upload; versionCode may stay unchanged.
- AAB for Play upload: increment `android.versionCode` every upload.
- Store-visible version changes should update `version`.
- Do not put signing passwords in Gradle files. Keep them in `credentials.json`;
  the script passes them through environment variables.
- Keep old `C:\aura-mobile-apk-build` as legacy only. Do not use it for
  multi-app builds.

## Adding A New Mobile App

1. Choose a build dir: `C:\build-<slug>-android`.
2. Ensure the app has `app.json` or `app.config.ts` with `android.package`.
3. Add `credentials.json` and `credentials\android\keystore.jks`.
4. Run `.codex\scripts\build-android.ps1 -AppSource <path> -BuildDir <dir> -Output Apk`.
5. For Play release, set/increment `android.versionCode` and build `-Output Aab`.

If the new app has no source `android\` directory, the script will run Expo
prebuild automatically. If it has a source `android\` directory that is only
prebuild output and not custom native code, prefer `-ForcePrebuild` so every app
uses the same generated-native build architecture.
