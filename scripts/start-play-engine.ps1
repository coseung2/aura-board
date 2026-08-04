$ErrorActionPreference = "Stop"
function Get-EnvMap([string]$path) {
  $map = @{}
  if (-not (Test-Path -LiteralPath $path)) { return $map }
  foreach ($line in Get-Content -LiteralPath $path) {
    if ($line -match '^\s*#' -or $line -notmatch '=') { continue }
    $idx = $line.IndexOf('=')
    $key = $line.Substring(0, $idx).Trim()
    $val = $line.Substring($idx + 1).Trim()
    if (($val.StartsWith('"') -and $val.EndsWith('"')) -or ($val.StartsWith("'") -and $val.EndsWith("'"))) {
      $val = $val.Substring(1, $val.Length - 2)
    }
    $map[$key] = $val
  }
  return $map
}
$root = "C:\Users\심보승\Desktop\Projects\aura-board"
$envMap = Get-EnvMap (Join-Path $root ".env")
$localMap = Get-EnvMap (Join-Path $root ".env.local")
foreach ($k in $localMap.Keys) { $envMap[$k] = $localMap[$k] }
foreach ($k in @("PLAY_ENGINE_ASSERTION_SECRET","PLAY_ENGINE_INTERNAL_SECRET")) {
  if (-not $envMap.ContainsKey($k) -or [string]::IsNullOrWhiteSpace([string]$envMap[$k])) { throw "missing $k" }
}
$db = $null
if ($envMap.ContainsKey("DIRECT_URL") -and -not [string]::IsNullOrWhiteSpace([string]$envMap["DIRECT_URL"])) {
  $db = [string]$envMap["DIRECT_URL"]
} elseif ($envMap.ContainsKey("DATABASE_URL")) {
  $db = [string]$envMap["DATABASE_URL"]
}
if ([string]::IsNullOrWhiteSpace($db)) { throw "missing DATABASE_URL/DIRECT_URL" }
$env:DATABASE_URL = $db
$env:PLAY_ENGINE_ASSERTION_SECRET = [string]$envMap["PLAY_ENGINE_ASSERTION_SECRET"]
$env:PLAY_ENGINE_INTERNAL_SECRET = [string]$envMap["PLAY_ENGINE_INTERNAL_SECRET"]
$env:PLAY_ENGINE_BIND = "127.0.0.1:8787"
if (-not $env:DATABASE_URL.StartsWith("postgres")) { throw "DATABASE_URL still not raw" }
$uri = [Uri]$env:DATABASE_URL
Write-Output "PLAY_ENGINE_DB_HOST=$($uri.Host):$($uri.Port)"
if (Test-Path C:\tmp\play-engine.out.log) { Clear-Content C:\tmp\play-engine.out.log } else { New-Item C:\tmp\play-engine.out.log -ItemType File | Out-Null }
if (Test-Path C:\tmp\play-engine.err.log) { Clear-Content C:\tmp\play-engine.err.log } else { New-Item C:\tmp\play-engine.err.log -ItemType File | Out-Null }
$proc = Start-Process -FilePath "cargo" -ArgumentList @("run","--manifest-path","services/play-engine/Cargo.toml","-p","play-server") -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput "C:\tmp\play-engine.out.log" -RedirectStandardError "C:\tmp\play-engine.err.log" -PassThru
Write-Output "PLAY_ENGINE_PID=$($proc.Id)"
