#requires -Version 7
<#
.SYNOPSIS
  Builds and starts the local play-engine service for development.

.DESCRIPTION
  The room list, room creation and gameplay commands are served by the Rust
  play-engine, not by Next directly. Without it those routes answer 503.

  Infisical's dev environment does not carry the engine settings, so this script
  generates local-only secrets, caches them under .codex/local, and starts the
  engine with the same `DATABASE_URL` the web app uses. Reuse the emitted values
  for the Next server so both sides share one assertion secret.

  These secrets are for local development only. They are not published to
  Infisical and the cache file is git-ignored.
#>
param(
  [int] $Port = 8090,
  [string] $InfisicalEnv = 'dev',
  [switch] $PrintEnvOnly
)

$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..' '..')
$secretDir = Join-Path $repoRoot '.codex/local'
$secretFile = Join-Path $secretDir 'play-engine.dev.json'

function New-LocalSecret {
  $bytes = [byte[]]::new(48)
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
  return [Convert]::ToBase64String($bytes)
}

if (-not (Test-Path -LiteralPath $secretDir)) {
  New-Item -ItemType Directory -Path $secretDir -Force | Out-Null
}

if (Test-Path -LiteralPath $secretFile) {
  $secrets = Get-Content -LiteralPath $secretFile -Raw | ConvertFrom-Json
} else {
  $secrets = [pscustomobject]@{
    assertionSecret = New-LocalSecret
    internalSecret  = New-LocalSecret
  }
  $secrets | ConvertTo-Json | Set-Content -LiteralPath $secretFile -Encoding UTF8
  Write-Output "Generated local-only engine secrets: $secretFile"
}

$engineUrl = "http://127.0.0.1:$Port"

if ($PrintEnvOnly) {
  Write-Output "PLAY_ENGINE_URL=$engineUrl"
  Write-Output "PLAY_ENGINE_ASSERTION_SECRET=$($secrets.assertionSecret)"
  Write-Output "PLAY_ENGINE_INTERNAL_SECRET=$($secrets.internalSecret)"
  return
}

$caBundle = Join-Path $repoRoot '.codex/artifacts/song-guess-source/windows-ca-bundle.crt'
if (Test-Path -LiteralPath $caBundle) {
  $env:CARGO_HTTP_CAINFO = $caBundle
  $env:SSL_CERT_FILE = $caBundle
}
$env:CARGO_TERM_COLOR = 'never'

Write-Output 'Building play-server...'
cargo build --manifest-path (Join-Path $repoRoot 'services/play-engine/Cargo.toml') -p play-server
if ($LASTEXITCODE -ne 0) { throw 'play-server build failed' }

$binary = Join-Path $repoRoot 'services/play-engine/target/debug/play-server.exe'
if (-not (Test-Path -LiteralPath $binary)) { throw "play-server binary not found: $binary" }

Get-CimInstance Win32_Process -Filter "Name='play-server.exe'" |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

$launcher = Join-Path ([System.IO.Path]::GetTempPath()) "aura-play-engine-$Port.ps1"
$launcherBody = @"
`$env:PLAY_ENGINE_BIND = '127.0.0.1:$Port'
`$env:PLAY_ENGINE_ASSERTION_SECRET = '$($secrets.assertionSecret)'
`$env:PLAY_ENGINE_INTERNAL_SECRET = '$($secrets.internalSecret)'
Set-Location '$repoRoot'
& infisical.exe run --env=$InfisicalEnv --path=/ -- '$binary'
"@
Set-Content -LiteralPath $launcher -Value $launcherBody -Encoding UTF8

Start-Process -FilePath 'pwsh' -ArgumentList @('-NoProfile', '-File', $launcher) -WindowStyle Hidden

for ($attempt = 0; $attempt -lt 20; $attempt++) {
  Start-Sleep -Seconds 2
  if (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue) {
    Write-Output "play-engine listening on $engineUrl"
    return
  }
}

throw "play-engine did not start on port $Port"
