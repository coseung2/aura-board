#requires -Version 7
<#
.SYNOPSIS
  Opens the local Postgres tunnel (15434) through an active OCI bastion
  managed-SSH session.

.DESCRIPTION
  Port-forwarding sessions reach the VM's SSH port but the VM does not
  authorize the local key directly, so a MANAGED_SSH session is used as a
  ProxyCommand jump host and Postgres is forwarded over it.
#>
param(
  [Parameter(Mandatory = $true)][string] $SessionId,
  [string] $KeyPath = "$env:USERPROFILE\.ssh\aura-oci-bastion-temp.pem",
  [string] $TargetIp = '10.42.1.207',
  [int] $LocalPort = 15434,
  [int] $RemotePort = 5432
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $KeyPath)) {
  throw "SSH key not found: $KeyPath"
}

Get-CimInstance Win32_Process -Filter "Name='ssh.exe'" |
  Where-Object { $_.CommandLine -like "*${LocalPort}:*" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

$bastionHost = 'host.bastion.ap-osaka-1.oci.oraclecloud.com'

# Start-Process mangles the nested ProxyCommand quoting, so the ssh invocation
# is written to a launcher script and run by a detached pwsh instance.
$launcher = Join-Path ([System.IO.Path]::GetTempPath()) "aura-db-tunnel-$LocalPort.ps1"
$launcherBody = @"
`$proxy = 'ssh -i "$KeyPath" -W %h:%p -p 22 $SessionId@$bastionHost'
& ssh -i '$KeyPath' ``
  -o "ProxyCommand=`$proxy" ``
  -o StrictHostKeyChecking=accept-new ``
  -o ExitOnForwardFailure=yes ``
  -o ServerAliveInterval=30 ``
  -o BatchMode=yes ``
  -L ${LocalPort}:127.0.0.1:${RemotePort} ``
  -p 22 ubuntu@$TargetIp 'sleep 86400'
"@
Set-Content -LiteralPath $launcher -Value $launcherBody -Encoding UTF8

Start-Process -FilePath 'pwsh' -ArgumentList @('-NoProfile', '-File', $launcher) -WindowStyle Hidden

for ($attempt = 0; $attempt -lt 12; $attempt++) {
  Start-Sleep -Seconds 2
  if (Get-NetTCPConnection -State Listen -LocalPort $LocalPort -ErrorAction SilentlyContinue) {
    break
  }
}

$listening = Get-NetTCPConnection -State Listen -LocalPort $LocalPort -ErrorAction SilentlyContinue
if (-not $listening) {
  throw "Tunnel did not open on port $LocalPort"
}

Write-Output "Tunnel listening on 127.0.0.1:$LocalPort"
