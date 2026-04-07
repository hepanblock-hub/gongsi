$ErrorActionPreference = 'Stop'

$root = 'D:\gongsihegui'
Set-Location $root

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

Invoke-StrictCommand -Command { node .\scripts\release_city_sitemap_batch.mjs --state=california --batch=2 } -ErrorMessage 'City release script failed.'

& git diff --quiet -- data/released-city-sitemap.json
if ($LASTEXITCODE -eq 0) {
  Write-Host 'No unreleased California cities left. Nothing to push.'
  exit 0
}

$stamp = Get-Date -Format 'yyyy-MM-dd'
Invoke-StrictCommand -Command { git add data/released-city-sitemap.json } -ErrorMessage 'git add failed.'
Invoke-StrictCommand -Command { git commit -m "chore: release next 2 california cities ($stamp)" } -ErrorMessage 'git commit failed.'

$pushed = $false
for ($attempt = 1; $attempt -le 3; $attempt++) {
  & git push origin main
  if ($LASTEXITCODE -eq 0) {
    $pushed = $true
    break
  }

  if ($attempt -lt 3) {
    Write-Warning "git push failed (attempt $attempt/3). Retrying in 3 seconds..."
    Start-Sleep -Seconds 3
  }
}

if (-not $pushed) {
  throw 'git push failed after 3 attempts.'
}

Write-Host 'Done. Released 2 more California cities and pushed source.'