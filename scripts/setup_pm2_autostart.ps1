$ErrorActionPreference = 'Stop'

$pm2 = Join-Path $env:APPDATA 'npm\pm2.cmd'
if (!(Test-Path $pm2)) {
  throw "pm2.cmd not found at $pm2"
}

$taskName = 'gongsihegui_pm2_resurrect'
$taskCmd = "`"$pm2`" resurrect"

schtasks /Create /TN $taskName /TR $taskCmd /SC ONLOGON /RL HIGHEST /F | Out-Null
Write-Host "Scheduled task created: $taskName"
Write-Host "Command: $taskCmd"
