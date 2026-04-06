$ErrorActionPreference = 'Stop'

$root = 'D:\gongsihegui'
$backupDir = Join-Path $root 'backups'
if (!(Test-Path $backupDir)) {
  New-Item -Path $backupDir -ItemType Directory | Out-Null
}

$ts = Get-Date -Format 'yyyyMMdd_HHmmss'
$outFile = Join-Path $backupDir "gongsihegui_db_$ts.sql"

$container = 'gongsihegui_postgres'
$cmd = "pg_dump -U gongsi_admin -d gongsihegui_db -F p"

Write-Host "Creating backup: $outFile"
docker exec $container sh -c "$cmd" | Out-File -FilePath $outFile -Encoding utf8
Write-Host "Backup completed: $outFile"
