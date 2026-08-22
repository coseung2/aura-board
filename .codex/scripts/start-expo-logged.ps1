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
  [string]$LogPath = "$env:TEMP\aura-expo.log",
  [string]$ApiBase
)

$ErrorActionPreference = "Stop"
$mobile = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "apps\mobile"

Remove-Item -LiteralPath $LogPath -Force -ErrorAction SilentlyContinue
Write-Host "log: $LogPath"

$adb = Get-Command adb -ErrorAction SilentlyContinue
$explicitApiBase = -not [string]::IsNullOrWhiteSpace($ApiBase)
$usbDevice = $null
if ($adb) {
  $usbDevice = (& $adb.Source devices 2>$null |
    Select-String "^(?<serial>[^\s]+)\s+device$").Matches |
    Select-Object -First 1 -ExpandProperty Groups |
    Where-Object Name -eq "serial" |
    Select-Object -First 1 -ExpandProperty Value
  if ($usbDevice) {
    & $adb.Source -s $usbDevice reverse tcp:3000 tcp:3000 | Out-Null
    & $adb.Source -s $usbDevice reverse tcp:8081 tcp:8081 | Out-Null
    if (-not $explicitApiBase) { $ApiBase = "http://127.0.0.1:3000" }
    Write-Host "USB device: $usbDevice (ADB reverse 3000/8081 enabled)"
  }
}

if (-not $ApiBase) {
  $lan = Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } |
    Select-Object -First 1 -ExpandProperty IPAddress
  if ($lan) { $ApiBase = "http://${lan}:3000" }
}
if ($ApiBase) {
  Write-Host "device API base: $ApiBase"
}

Set-Location $mobile
# Expo Go loads the bundle straight from Metro, so the bundled expo-updates
# client must not try to fetch the production EAS update first. Without this the
# device fails with "Failed to download remote update" even though Metro is
# reachable and serving the bundle in seconds. See apps/mobile/app.config.ts.
$env:AURA_EXPO_GO = "1"
$env:EXPO_OFFLINE = "1"
$env:EXPO_PUBLIC_API_BASE = $ApiBase
# Infisical prints its upgrade notice to stderr even when injection succeeds.
# PowerShell's Stop preference otherwise aborts before Metro starts.
$ErrorActionPreference = "Continue"
& infisical run --env=$Env -- npx expo start --offline *>&1 |
  Tee-Object -FilePath $LogPath
if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
