param(
  [string]$AppSource,
  [string]$BuildDir,
  [ValidateSet('Apk', 'Aab', 'Both')][string]$Output = 'Apk',
  [string]$AndroidSdkRoot = 'C:\Android\Sdk',
  [string]$GradleUserHome,
  [string]$TempDir,
  [string]$JavaUserHome,
  [string]$DeepLinkScheme,
  [switch]$SkipNpmInstall,
  [switch]$SkipClean,
  [switch]$ForcePrebuild,
  [switch]$PrepareOnly,
  [switch]$SubmitAndroid,
  [switch]$Help
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Show-Help {
  @(
    'Build Android APK/AAB for an Expo mobile app from an ASCII build directory.',
    '',
    'Required:',
    '  -AppSource  Path to the Expo app source containing app.json or app.config.ts.',
    '  -BuildDir   Dedicated ASCII build directory. Use one build dir per app.',
    '',
    'Examples:',
    '  powershell -NoProfile -ExecutionPolicy Bypass -File .codex\scripts\build-android.ps1 -AppSource apps\mobile -BuildDir C:\build-aura-board-android -Output Apk',
    '  powershell -NoProfile -ExecutionPolicy Bypass -File .codex\scripts\build-android.ps1 -AppSource C:\Users\<user>\Desktop\Projects\aura\aura-mobile -BuildDir C:\build-aura-android -Output Both',
    '  powershell -NoProfile -ExecutionPolicy Bypass -File .codex\scripts\build-android.ps1 -AppSource apps\mobile -BuildDir C:\build-aura-board-android -ForcePrebuild -PrepareOnly'
  ) -join "`n" | Write-Host
}

function Resolve-RequiredPath {
  param([string]$Path, [string]$Label)
  if (-not $Path -or -not (Test-Path -LiteralPath $Path)) {
    throw "$Label not found: $Path"
  }
  return (Resolve-Path -LiteralPath $Path).Path
}

function Ensure-Directory {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) {
    New-Item -ItemType Directory -Force -Path $Path | Out-Null
  }
  return (Resolve-Path -LiteralPath $Path).Path
}

function Mirror-Directory {
  param([string]$Source, [string]$Destination, [string]$BuildRoot)
  if (-not (Test-Path -LiteralPath $Source)) { return }
  Ensure-Directory -Path $Destination | Out-Null
  $resolvedDestination = (Resolve-Path -LiteralPath $Destination).Path.TrimEnd('\') + '\'
  if (-not $resolvedDestination.StartsWith($BuildRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to mirror outside build root: $Destination"
  }
  robocopy $Source $Destination /MIR /NFL /NDL /NJH /NJS /NP /XD node_modules .expo build .gradle /XF .env .env.* | Out-Null
  if ($LASTEXITCODE -gt 7) {
    throw "robocopy failed for $Source with exit code $LASTEXITCODE"
  }
}

function Copy-If-Exists {
  param([string]$Source, [string]$Destination)
  if (Test-Path -LiteralPath $Source) {
    Copy-Item -LiteralPath $Source -Destination $Destination -Force
  }
}

function Remove-BuildSubdirectory {
  param([string]$Path, [string]$BuildRoot)
  if (-not (Test-Path -LiteralPath $Path)) { return }
  $resolvedPath = (Resolve-Path -LiteralPath $Path).Path.TrimEnd('\') + '\'
  if (-not $resolvedPath.StartsWith($BuildRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove outside build root: $Path"
  }
  Remove-Item -LiteralPath $Path -Recurse -Force
}

function Set-AsciiBuildEnvironment {
  param(
    [string]$AndroidSdkRoot,
    [string]$GradleUserHome,
    [string]$TempDir,
    [string]$JavaUserHome
  )
  $env:ANDROID_HOME = $AndroidSdkRoot
  $env:ANDROID_SDK_ROOT = $AndroidSdkRoot
  $env:GRADLE_USER_HOME = $GradleUserHome
  $env:TEMP = $TempDir
  $env:TMP = $TempDir
  $env:USERPROFILE = $JavaUserHome
  $env:HOME = $JavaUserHome
  $env:JAVA_TOOL_OPTIONS = "-Duser.home=$JavaUserHome -Dfile.encoding=UTF-8"
}

function Get-BalancedObjectBlock {
  param([string]$Text, [string]$PropertyName)
  $match = [regex]::Match($Text, "(?m)\b$([regex]::Escape($PropertyName))\s*:")
  if (-not $match.Success) { return '' }
  $brace = $Text.IndexOf('{', $match.Index)
  if ($brace -lt 0) { return '' }
  $depth = 1
  $i = $brace + 1
  while ($i -lt $Text.Length -and $depth -gt 0) {
    if ($Text[$i] -eq '{') { $depth++ }
    elseif ($Text[$i] -eq '}') { $depth-- }
    $i++
  }
  return $Text.Substring($brace, $i - $brace)
}

function Get-TsStringValue {
  param([string]$Text, [string]$PropertyName)
  $match = [regex]::Match($Text, "(?m)^\s*$([regex]::Escape($PropertyName))\s*:\s*['""]([^'""]+)['""]")
  if ($match.Success) { return $match.Groups[1].Value }
  return ''
}

function Read-AppConfig {
  param([string]$SourceDir, [string]$SchemeOverride)
  $jsonPath = Join-Path $SourceDir 'app.json'
  $tsPath = Join-Path $SourceDir 'app.config.ts'

  if (Test-Path -LiteralPath $jsonPath) {
    $json = Get-Content -Raw -LiteralPath $jsonPath | ConvertFrom-Json
    $expo = $json.expo
    $scheme = if ($SchemeOverride) { $SchemeOverride } else { [string]$expo.scheme }
    $versionCode = 1
    if ($expo.android.versionCode) { $versionCode = [int]$expo.android.versionCode }
    return [pscustomobject]@{
      Name = [string]$expo.name
      Slug = [string]$expo.slug
      Scheme = $scheme
      Package = [string]$expo.android.package
      VersionName = [string]$expo.version
      VersionCode = $versionCode
    }
  }

  if (Test-Path -LiteralPath $tsPath) {
    $text = Get-Content -Raw -LiteralPath $tsPath
    $androidBlock = Get-BalancedObjectBlock -Text $text -PropertyName 'android'
    $packageMatch = [regex]::Match($androidBlock, "package\s*:\s*['""]([^'""]+)['""]")
    $versionCodeMatch = [regex]::Match($androidBlock, 'versionCode\s*:\s*(\d+)')
    $scheme = if ($SchemeOverride) { $SchemeOverride } else { Get-TsStringValue -Text $text -PropertyName 'scheme' }
    return [pscustomObject]@{
      Name = Get-TsStringValue -Text $text -PropertyName 'name'
      Slug = Get-TsStringValue -Text $text -PropertyName 'slug'
      Scheme = $scheme
      Package = $packageMatch.Groups[1].Value
      VersionName = Get-TsStringValue -Text $text -PropertyName 'version'
      VersionCode = if ($versionCodeMatch.Success) { [int]$versionCodeMatch.Groups[1].Value } else { 1 }
    }
  }

  throw "Expo config not found under $SourceDir"
}

function Write-Utf8NoBom {
  param([string]$Path, [string]$Text)
  $encoding = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($Path, $Text, $encoding)
}

function Get-Sha256 {
  param([string]$Path)
  $stream = [System.IO.File]::OpenRead($Path)
  $hasher = [System.Security.Cryptography.SHA256]::Create()
  try {
    return ([System.BitConverter]::ToString($hasher.ComputeHash($stream))).Replace('-', '')
  } finally {
    $hasher.Dispose()
    $stream.Dispose()
  }
}

function Convert-ToGradlePropertiesPath {
  param([string]$Path)
  return $Path.Replace('\', '/')
}

function Patch-AndroidProject {
  param([string]$BuildDir, [object]$Config)
  $buildGradle = Join-Path $BuildDir 'android\app\build.gradle'
  if (-not (Test-Path -LiteralPath $buildGradle)) { throw "Android app build.gradle missing: $buildGradle" }

  $gradle = Get-Content -Raw -LiteralPath $buildGradle
  $gradle = [regex]::Replace($gradle, 'namespace\s+"[^"]+"', "namespace `"$($Config.Package)`"")
  $gradle = [regex]::Replace($gradle, 'applicationId\s+"[^"]+"', "applicationId `"$($Config.Package)`"")
  $gradle = [regex]::Replace($gradle, 'versionCode\s+\d+', "versionCode $($Config.VersionCode)")
  $gradle = [regex]::Replace($gradle, 'versionName\s+"[^"]+"', "versionName `"$($Config.VersionName)`"")

  if ($gradle -match 'signingConfigs\s*\{') {
    $gradle = [regex]::Replace($gradle, 'signingConfigs\s*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', '')
  }
  $signing = @"
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
        release {
            storeFile file(findProperty('AURA_UPLOAD_STORE_FILE') ?: 'release.keystore')
            storePassword findProperty('AURA_UPLOAD_STORE_PASSWORD') ?: ''
            keyAlias findProperty('AURA_UPLOAD_KEY_ALIAS') ?: ''
            keyPassword findProperty('AURA_UPLOAD_KEY_PASSWORD') ?: ''
        }
    }
"@
  $gradle = $gradle -replace '(android\s*\{\s*\r?\n)', "`$1$signing`r`n"
  $gradle = $gradle -replace 'signingConfig signingConfigs\.debug', 'signingConfig signingConfigs.release'
  Write-Utf8NoBom -Path $buildGradle -Text $gradle

  $stringsPath = Join-Path $BuildDir 'android\app\src\main\res\values\strings.xml'
  if (Test-Path -LiteralPath $stringsPath) {
    $strings = Get-Content -Raw -LiteralPath $stringsPath
    $strings = [regex]::Replace($strings, '<string name="app_name">[^<]+</string>', "<string name=`"app_name`">$($Config.Name)</string>")
    Write-Utf8NoBom -Path $stringsPath -Text $strings
  }

  $manifestPath = Join-Path $BuildDir 'android\app\src\main\AndroidManifest.xml'
  if ((Test-Path -LiteralPath $manifestPath) -and $Config.Scheme) {
    $manifest = Get-Content -Raw -LiteralPath $manifestPath
    if ($manifest -notmatch ('android:scheme="' + [regex]::Escape($Config.Scheme) + '"')) {
      $launcher = "      <intent-filter>`r`n        <action android:name=`"android.intent.action.MAIN`"/>`r`n        <category android:name=`"android.intent.category.LAUNCHER`"/>`r`n      </intent-filter>"
      $deeplink = "$launcher`r`n      <intent-filter>`r`n        <action android:name=`"android.intent.action.VIEW`"/>`r`n        <category android:name=`"android.intent.category.DEFAULT`"/>`r`n        <category android:name=`"android.intent.category.BROWSABLE`"/>`r`n        <data android:scheme=`"$($Config.Scheme)`"/>`r`n      </intent-filter>"
      $manifest = $manifest.Replace($launcher, $deeplink)
      Write-Utf8NoBom -Path $manifestPath -Text $manifest
    }
  }

  $settingsPath = Join-Path $BuildDir 'android\settings.gradle'
  if (Test-Path -LiteralPath $settingsPath) {
    $settings = Get-Content -Raw -LiteralPath $settingsPath
    $rootName = ($Config.Slug -replace '[^A-Za-z0-9_.-]', '-')
    $settings = [regex]::Replace($settings, "rootProject\.name\s*=\s*'[^']+'", "rootProject.name = '$rootName'")
    Write-Utf8NoBom -Path $settingsPath -Text $settings
  }
}

if ($Help) {
  Show-Help
  exit 0
}
if (-not $AppSource -or -not $BuildDir) {
  Show-Help
  throw 'AppSource and BuildDir are required.'
}

$AppSource = Resolve-RequiredPath -Path $AppSource -Label 'AppSource'
$BuildDir = Ensure-Directory -Path $BuildDir
$BuildRoot = $BuildDir.TrimEnd('\') + '\'
$AndroidSdkRoot = Resolve-RequiredPath -Path $AndroidSdkRoot -Label 'AndroidSdkRoot'
if (-not $GradleUserHome) { $GradleUserHome = Join-Path $BuildDir '.gradle-user' }
if (-not $TempDir) { $TempDir = Join-Path $BuildDir '.tmp' }
if (-not $JavaUserHome) { $JavaUserHome = Join-Path $BuildDir '.java-userhome' }
$GradleUserHome = Ensure-Directory -Path $GradleUserHome
$TempDir = Ensure-Directory -Path $TempDir
$JavaUserHome = Ensure-Directory -Path $JavaUserHome
Set-AsciiBuildEnvironment -AndroidSdkRoot $AndroidSdkRoot -GradleUserHome $GradleUserHome -TempDir $TempDir -JavaUserHome $JavaUserHome

$config = Read-AppConfig -SourceDir $AppSource -SchemeOverride $DeepLinkScheme
if (-not $config.Package) { throw 'android.package is required in app.json/app.config.ts.' }
if (-not $config.VersionName) { throw 'version is required in app.json/app.config.ts.' }

foreach ($dir in @('app', 'assets', 'components', 'constants', 'hooks', 'lib', 'modules', 'plugins', 'providers', 'scripts', 'theme')) {
  Mirror-Directory -Source (Join-Path $AppSource $dir) -Destination (Join-Path $BuildDir $dir) -BuildRoot $BuildRoot
}
foreach ($file in @('app.json', 'app.config.ts', 'package.json', 'package-lock.json', 'tsconfig.json', 'eas.json', 'google-services.json', 'credentials.json', '.npmrc', 'expo-env.d.ts')) {
  Copy-If-Exists -Source (Join-Path $AppSource $file) -Destination (Join-Path $BuildDir $file)
}

$sourceAndroid = Join-Path $AppSource 'android'
if ($ForcePrebuild) {
  Remove-BuildSubdirectory -Path (Join-Path $BuildDir 'android') -BuildRoot $BuildRoot
} elseif (Test-Path -LiteralPath $sourceAndroid) {
  Mirror-Directory -Source $sourceAndroid -Destination (Join-Path $BuildDir 'android') -BuildRoot $BuildRoot
}

if (-not $SkipNpmInstall) {
  Push-Location $BuildDir
  try { npm ci } finally { Pop-Location }
}

$androidDir = Join-Path $BuildDir 'android'
if (-not (Test-Path -LiteralPath $androidDir)) {
  Push-Location $BuildDir
  try { npx expo prebuild --platform android --no-install --clean } finally { Pop-Location }
}

$sdkPropertiesPath = Convert-ToGradlePropertiesPath -Path $AndroidSdkRoot
Write-Utf8NoBom -Path (Join-Path $androidDir 'local.properties') -Text "sdk.dir=$sdkPropertiesPath`n"
Patch-AndroidProject -BuildDir $BuildDir -Config $config

$credentialsPath = Join-Path $AppSource 'credentials.json'
if (Test-Path -LiteralPath $credentialsPath) {
  $credentials = Get-Content -Raw -LiteralPath $credentialsPath | ConvertFrom-Json
  $keystore = $credentials.android.keystore
  $sourceKeystore = Resolve-RequiredPath -Path (Join-Path $AppSource $keystore.keystorePath) -Label 'Android keystore'
  Copy-Item -LiteralPath $sourceKeystore -Destination (Join-Path $BuildDir 'android\app\release.keystore') -Force
  $env:ORG_GRADLE_PROJECT_AURA_UPLOAD_STORE_FILE = 'release.keystore'
  $env:ORG_GRADLE_PROJECT_AURA_UPLOAD_STORE_PASSWORD = [string]$keystore.keystorePassword
  $env:ORG_GRADLE_PROJECT_AURA_UPLOAD_KEY_ALIAS = [string]$keystore.keyAlias
  $env:ORG_GRADLE_PROJECT_AURA_UPLOAD_KEY_PASSWORD = [string]$keystore.keyPassword
}

if ($PrepareOnly) {
  [pscustomobject]@{
    AppName = $config.Name
    Package = $config.Package
    VersionName = $config.VersionName
    VersionCode = $config.VersionCode
    BuildDir = $BuildDir
    PreparedOnly = $true
  }
  exit 0
}

$env:ANDROID_HOME = $AndroidSdkRoot
$env:ANDROID_SDK_ROOT = $AndroidSdkRoot
$env:GRADLE_USER_HOME = $GradleUserHome
$env:TEMP = $TempDir
$env:TMP = $TempDir
$env:USERPROFILE = $JavaUserHome
$env:HOME = $JavaUserHome
$env:NODE_ENV = 'production'
$env:JAVA_TOOL_OPTIONS = "-Duser.home=$JavaUserHome -Dfile.encoding=UTF-8"

$gradlew = Resolve-RequiredPath -Path (Join-Path $BuildDir 'android\gradlew.bat') -Label 'Gradle wrapper'
Push-Location $androidDir
try {
  if (-not $SkipClean) {
    & $gradlew --no-daemon clean
    if ($LASTEXITCODE -ne 0) { throw 'Gradle clean failed.' }
  }
  $tasks = @()
  if ($Output -in @('Apk', 'Both')) { $tasks += ':app:assembleRelease' }
  if ($Output -in @('Aab', 'Both')) { $tasks += ':app:bundleRelease' }
  & $gradlew --no-daemon @tasks -x lintVitalRelease -x lintVitalAnalyzeRelease
  if ($LASTEXITCODE -ne 0) { throw "Gradle build failed for $($tasks -join ', ')." }
} finally {
  Pop-Location
}

$artifacts = @()
$apk = Join-Path $BuildDir 'android\app\build\outputs\apk\release\app-release.apk'
$aab = Join-Path $BuildDir 'android\app\build\outputs\bundle\release\app-release.aab'
foreach ($candidate in @($apk, $aab)) {
  if (Test-Path -LiteralPath $candidate) {
    $item = Get-Item -LiteralPath $candidate
    $artifacts += [pscustomobject]@{
      Path = $item.FullName
      SizeBytes = $item.Length
      SHA256 = Get-Sha256 -Path $item.FullName
      LastWriteTime = $item.LastWriteTime
    }
  }
}

if ($SubmitAndroid) {
  $aabArtifact = $artifacts | Where-Object { $_.Path -like '*.aab' } | Select-Object -First 1
  if (-not $aabArtifact) { throw 'SubmitAndroid requires Output Aab or Both.' }
  Push-Location $AppSource
  try { npx eas-cli@latest submit -p android --profile production --path $aabArtifact.Path --non-interactive } finally { Pop-Location }
}

[pscustomobject]@{
  AppName = $config.Name
  Package = $config.Package
  VersionName = $config.VersionName
  VersionCode = $config.VersionCode
  Output = $Output
  Artifacts = $artifacts
}
