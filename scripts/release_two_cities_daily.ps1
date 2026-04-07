$ErrorActionPreference = 'Stop'

$root = 'D:\gongsihegui'
Set-Location $root

function Get-EnvValueFromFile {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath,
    [Parameter(Mandatory = $true)]
    [string]$Key
  )

  if (-not (Test-Path $FilePath)) {
    return $null
  }

  $pattern = "^\s*" + [regex]::Escape($Key) + "\s*=\s*(.+?)\s*$"
  foreach ($line in Get-Content -Path $FilePath -Encoding UTF8) {
    if ($line.Trim().StartsWith('#')) { continue }
    $m = [regex]::Match($line, $pattern)
    if ($m.Success) {
      $value = $m.Groups[1].Value.Trim()
      if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
        $value = $value.Substring(1, $value.Length - 2)
      }
      return $value
    }
  }

  return $null
}

function Invoke-StrictCommand {
  param(
    [Parameter(Mandatory = $true)]
    [scriptblock]$Command,
    [Parameter(Mandatory = $true)]
    [string]$ErrorMessage
  )

  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw $ErrorMessage
  }
}

$prodEnvPath = Join-Path $root '.env.production'
$prodDatabaseUrl = Get-EnvValueFromFile -FilePath $prodEnvPath -Key 'DATABASE_URL'

if ([string]::IsNullOrWhiteSpace($prodDatabaseUrl)) {
  throw "DATABASE_URL not found in $prodEnvPath."
}

if ($prodDatabaseUrl -match 'localhost|127\.0\.0\.1') {
  throw 'Refusing to run: .env.production DATABASE_URL points to local database.'
}

$env:DATABASE_URL = $prodDatabaseUrl
Write-Host 'Target database: production (from .env.production)'

Invoke-StrictCommand -Command { node .\scripts\release_city_sitemap_batch.mjs --state=california --batch=2 } -ErrorMessage 'City release script failed.'
Write-Host 'Done. Released 2 more California cities with pure database operation.'