param(
  [string]$LocalHost = "127.0.0.1",
  [int]$LocalPort = 54333,
  [string]$LocalDb = "gongsihegui_db",
  [string]$LocalUser = "gongsi_admin",
  [string]$LocalPassword = "gongsi_pass_2026",

  [string]$RemoteHost,
  [int]$RemotePort = 6543,
  [string]$RemoteDb = "postgres",
  [string]$RemoteUser,
  [string]$RemotePassword,

  [string]$Schema = "public"
)

$ErrorActionPreference = "Stop"

if (-not $RemoteHost -or -not $RemoteUser -or -not $RemotePassword) {
  throw "必须提供 RemoteHost / RemoteUser / RemotePassword。"
}

$backupDir = "D:\gongsihegui\backups"
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
$ts = Get-Date -Format "yyyyMMdd_HHmmss"
$sqlFile = Join-Path $backupDir "sync_${Schema}_$ts.sql"
$localCountCsv = Join-Path $backupDir "local_${Schema}_counts_$ts.csv"
$remoteCountCsv = Join-Path $backupDir "remote_${Schema}_counts_$ts.csv"

Write-Host "[1/5] 导出本地 $Schema schema+data ..."
$env:PGPASSWORD = $LocalPassword
& pg_dump -h $LocalHost -p $LocalPort -U $LocalUser -d $LocalDb -n $Schema --no-owner --no-privileges --clean --if-exists -f $sqlFile
if ($LASTEXITCODE -ne 0) { throw "本地导出失败" }

Write-Host "[2/5] 导出本地表行数 ..."
$localSql = @"
SELECT table_name, row_count
FROM (
  SELECT 'companies' as table_name, count(*)::bigint as row_count FROM public.companies
  UNION ALL SELECT 'company_pages', count(*) FROM public.company_pages
  UNION ALL SELECT 'company_registrations', count(*) FROM public.company_registrations
  UNION ALL SELECT 'company_risk_scores', count(*) FROM public.company_risk_scores
  UNION ALL SELECT 'contractor_licenses', count(*) FROM public.contractor_licenses
  UNION ALL SELECT 'data_sources', count(*) FROM public.data_sources
  UNION ALL SELECT 'osha_inspections', count(*) FROM public.osha_inspections
) t
ORDER BY 1;
"@
& psql -h $LocalHost -p $LocalPort -U $LocalUser -d $LocalDb -At -F ',' -c $localSql | Set-Content -Encoding UTF8 $localCountCsv
if ($LASTEXITCODE -ne 0) { throw "本地计数导出失败" }

Write-Host "[3/5] 导入到远程数据库 ..."
$env:PGPASSWORD = $RemotePassword
$env:PGSSLMODE = "require"
& psql -h $RemoteHost -p $RemotePort -U $RemoteUser -d $RemoteDb -v ON_ERROR_STOP=1 -f $sqlFile
if ($LASTEXITCODE -ne 0) { throw "远程导入失败" }

Write-Host "[4/5] 导出远程表行数 ..."
& psql -h $RemoteHost -p $RemotePort -U $RemoteUser -d $RemoteDb -At -F ',' -c $localSql | Set-Content -Encoding UTF8 $remoteCountCsv
if ($LASTEXITCODE -ne 0) { throw "远程计数导出失败" }

Write-Host "[5/5] 对比结果 ..."
$localMap = @{}
Get-Content $localCountCsv | ForEach-Object {
  $p = $_ -split ','
  if ($p.Length -ge 2) { $localMap[$p[0]] = [int64]$p[1] }
}

$ok = $true
Get-Content $remoteCountCsv | ForEach-Object {
  $p = $_ -split ','
  if ($p.Length -ge 2) {
    $t = $p[0]
    $rv = [int64]$p[1]
    $lv = if ($localMap.ContainsKey($t)) { $localMap[$t] } else { -1 }
    if ($lv -ne $rv) {
      $ok = $false
      Write-Host "[DIFF] $t local=$lv remote=$rv"
    } else {
      Write-Host "[OK]   $t = $rv"
    }
  }
}

Write-Host "SQL导出文件: $sqlFile"
Write-Host "本地计数: $localCountCsv"
Write-Host "远程计数: $remoteCountCsv"

if (-not $ok) {
  throw "已导入，但表计数存在差异，请检查。"
}

Write-Host "完成：远程结构与数量已与本地一致。"
