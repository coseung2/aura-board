<#
.SYNOPSIS
Start Expo with its output captured to a file.

.DESCRIPTION
Expo normally runs in an interactive window whose scrollback is unreachable from
an agent session, which hides the one message that explains a failed device load.
This writes everything to a log instead.
#>
param(
  [string]$Env = "dev",
  [string]$LogPath = "$env:TEMP\aura-expo.log"
)

$ErrorActionPreference = "Stop"
$mobile = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "apps\mobile"

Remove-Item -LiteralPath $LogPath -Force -ErrorAction SilentlyContinue
Write-Host "log: $LogPath"

Set-Location $mobile
# Expo Go loads the bundle straight from Metro, so the bundled expo-updates
# client must not try to fetch the production EAS update first. Without this the
# device fails with "Failed to download remote update" even though Metro is
# reachable and serving the bundle in seconds. See apps/mobile/app.config.ts.
$env:AURA_EXPO_GO = "1"
$env:EXPO_OFFLINE = "1"
& infisical run --env=$Env -- npx expo start --offline *>&1 |
  Tee-Object -FilePath $LogPath
