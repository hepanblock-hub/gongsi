Set-Location D:\gongsihegui

$baseUrl = if ($env:SNAPSHOT_BASE_URL) { $env:SNAPSHOT_BASE_URL.TrimEnd('/') } else { 'http://localhost:39017' }

$urls = @(
  @{name='01_state_california'; url="$baseUrl/state/california"},
  @{name='02_city_los_angeles'; url="$baseUrl/state/california/city/los-angeles"},
  @{name='03_filter_quality'; url="$baseUrl/state/california/filter/quality"},
  @{name='04_filter_osha'; url="$baseUrl/state/california/filter/osha"},
  @{name='05_filter_contractor_licenses'; url="$baseUrl/state/california/filter/contractor-licenses"},
  @{name='06_company_1'; url="$baseUrl/company/vale-care-center-ca"},
  @{name='07_company_2'; url="$baseUrl/company/tci-obispo-ca"},
  @{name='08_company_3'; url="$baseUrl/company/starpoint-property-manangement-ca"},
  @{name='09_company_4'; url="$baseUrl/company/sparr-heights-estates-senior-living-ca"},
  @{name='10_company_5'; url="$baseUrl/company/serrano-post-acute-ca"},
  @{name='11_company_6'; url="$baseUrl/company/point-loma-estates-memory-care-ca"},
  @{name='12_company_7'; url="$baseUrl/company/ocvibe-private-street-package-1-ca"},
  @{name='13_company_8'; url="$baseUrl/company/nbbj-san-francisco-ca"},
  @{name='14_company_9'; url="$baseUrl/company/mutual-wholesale-liquor-ca"},
  @{name='15_company_10'; url="$baseUrl/company/maritime-warehouse-ca"}
)

$outputDir = 'D:\gongsihegui\public\page_snapshots'
if (!(Test-Path $outputDir)) {
  New-Item -ItemType Directory -Path $outputDir | Out-Null
}

foreach ($u in $urls) {
  Write-Host "Capturing $($u.name)..."
  npx playwright screenshot --full-page --viewport-size="1440,900" "$($u.url)" "$outputDir\$($u.name).png"
}

Write-Host "Done. Snapshots saved to $outputDir"