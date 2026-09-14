#requires -Version 7
<#
.SYNOPSIS
  Restarts the Next dev server with the local play-engine settings injected.

.DESCRIPTION
  Next reaches the play-engine through `PLAY_ENGINE_URL` and signs actor
  assertions with `PLAY_ENGINE_ASSERTION_SECRET`. Those values are absent from
  the Infisical dev environment, so the room routes answer 503 until both
  processes share one secret.

  This reuses the local-only secrets created by start-play-engine.ps1 so the
  HMAC on each side matches.
#>
param(
  [int] $EnginePort = 8090,
  [int] $Port = 3000,
  [string] $InfisicalEnv = 'dev',
  # Once PLAY_ENGINE_* live in Infisical, the injected values are enough and no
  # local override is needed.
  [switch] $UseInfisicalOnly
)

$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..' '..')
$overrides = ''
if (-not $UseInfisicalOnly) {
  $secretFile = Join-Path $repoRoot '.codex/local/play-engine.dev.json'
  if (-not (Test-Path -LiteralPath $secretFile)) {
    throw "Run start-play-engine.ps1 first to create $secretFile"
  }
  $secrets = Get-Content -LiteralPath $secretFile -Raw | ConvertFrom-Json
  $overrides = @"
`$env:PLAY_ENGINE_URL = 'http://127.0.0.1:$EnginePort'
`$env:PLAY_ENGINE_ASSERTION_SECRET = '$($secrets.assertionSecret)'
`$env:PLAY_ENGINE_INTERNAL_SECRET = '$($secrets.internalSecret)'
"@
}

Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique |
  ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2

$launcher = Join-Path ([System.IO.Path]::GetTempPath()) "aura-next-engine-$Port.ps1"
$launcherBody = @"
$overrides
Set-Location '$repoRoot'
& infisical.exe run --env=$InfisicalEnv --path=/ -- npm run dev
"@
Set-Content -LiteralPath $launcher -Value $launcherBody -Encoding UTF8

Start-Process -FilePath 'pwsh' -ArgumentList @('-NoProfile', '-File', $launcher) -WindowStyle Hidden

for ($attempt = 0; $attempt -lt 45; $attempt++) {
  Start-Sleep -Seconds 2
  try {
    $health = Invoke-RestMethod -Uri "http://localhost:$Port/api/health" -TimeoutSec 5 -SkipHttpErrorCheck
    if ($health.ok) {
      Write-Output "Next dev server ready on http://localhost:$Port"
      return
    }
  } catch {
    # Keep polling while the dev server compiles.
  }
}

throw "Next dev server did not become healthy on port $Port"
