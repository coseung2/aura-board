<#
.SYNOPSIS
Start the Next.js and Expo dev servers for on-device pet checks.

.DESCRIPTION
Mobile pulls vehicle art from the web server over HTTP, so Expo alone shows an
empty ride. This starts both, with secrets injected by Infisical, and leaves each
in its own window so closing one does not kill the other.

A USB device reaches the host through `adb reverse`, which is set up here when
adb is available. A Wi-Fi device should instead set EXPO_PUBLIC_API_BASE to the
host LAN address.
#>
param(
  [string]$Env = "dev",
  # LAN address the phone should call. Wi-Fi devices cannot reach the host's
  # 127.0.0.1, and without adb there is no USB tunnel to fall back on.
  [string]$ApiBase
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

Write-Host "repo: $repo"
Write-Host "infisical env: $Env"

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
} else {
  Write-Warning "No LAN address found; the device will fall back to 127.0.0.1 and load no art."
}

# Next.js binds localhost by default, which a phone cannot reach.
$hostArgs = "-H 0.0.0.0"

Start-Process -FilePath "pwsh" -ArgumentList @(
  "-NoProfile", "-NoExit", "-Command",
  "Set-Location '$repo'; infisical run --env=$Env -- npx next dev $hostArgs"
) -WorkingDirectory $repo

Start-Process -FilePath "pwsh" -ArgumentList @(
  "-NoProfile", "-NoExit", "-Command",
  "Set-Location '$repo\apps\mobile'; `$env:EXPO_PUBLIC_API_BASE='$ApiBase'; infisical run --env=$Env -- npx expo start --clear"
) -WorkingDirectory "$repo\apps\mobile"

Write-Host "Next.js and Expo starting in separate windows."
