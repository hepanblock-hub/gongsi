Set-Location D:\gongsihegui

$pages = @(
  @{name='01_state_california'; type='state'; url='http://localhost:39017/state/california'},
  @{name='02_city_los_angeles'; type='city'; url='http://localhost:39017/state/california/city/los-angeles'},
  @{name='03_filter_quality'; type='filter'; url='http://localhost:39017/state/california/filter/quality'},
  @{name='04_filter_osha'; type='filter'; url='http://localhost:39017/state/california/filter/osha'},
  @{name='05_filter_license'; type='filter'; url='http://localhost:39017/state/california/filter/license'},
  @{name='06_company_1'; type='company'; url='http://localhost:39017/company/vale-care-center-ca'},
  @{name='07_company_2'; type='company'; url='http://localhost:39017/company/tci-obispo-ca'},
  @{name='08_company_3'; type='company'; url='http://localhost:39017/company/starpoint-property-manangement-ca'},
  @{name='09_company_4'; type='company'; url='http://localhost:39017/company/sparr-heights-estates-senior-living-ca'},
  @{name='10_company_5'; type='company'; url='http://localhost:39017/company/serrano-post-acute-ca'},
  @{name='11_company_6'; type='company'; url='http://localhost:39017/company/point-loma-estates-memory-care-ca'},
  @{name='12_company_7'; type='company'; url='http://localhost:39017/company/ocvibe-private-street-package-1-ca'},
  @{name='13_company_8'; type='company'; url='http://localhost:39017/company/nbbj-san-francisco-ca'},
  @{name='14_company_9'; type='company'; url='http://localhost:39017/company/mutual-wholesale-liquor-ca'},
  @{name='15_company_10'; type='company'; url='http://localhost:39017/company/maritime-warehouse-ca'}
)

function Get-MetaContent($html, $name) {
  $pattern = "<meta[^>]+name=['\"']$name['\"'][^>]+content=['\"']([^'\"']*)['\"']"
  $m = [regex]::Match($html, $pattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
  if ($m.Success) { return $m.Groups[1].Value }
  return ''
}

function Get-PropertyContent($html, $property) {
  $pattern = "<meta[^>]+property=['\"']$property['\"'][^>]+content=['\"']([^'\"']*)['\"']"
  $m = [regex]::Match($html, $pattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
  if ($m.Success) { return $m.Groups[1].Value }
  return ''
}

function Get-LinkHref($html, $rel) {
  $pattern = "<link[^>]+rel=['\"']$rel['\"'][^>]+href=['\"']([^'\"']*)['\"']"
  $m = [regex]::Match($html, $pattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
  if ($m.Success) { return $m.Groups[1].Value }
  return ''
}

$results = @()

foreach ($p in $pages) {
  try {
    $resp = Invoke-WebRequest -Uri $p.url -UseBasicParsing -TimeoutSec 60
    $html = $resp.Content

    $titleMatch = [regex]::Match($html, '<title>(.*?)</title>', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase -bor [System.Text.RegularExpressions.RegexOptions]::Singleline)
    $title = if ($titleMatch.Success) { $titleMatch.Groups[1].Value.Trim() } else { '' }

    $desc = Get-MetaContent $html 'description'
    if ([string]::IsNullOrWhiteSpace($desc)) { $desc = Get-PropertyContent $html 'og:description' }

    $robots = Get-MetaContent $html 'robots'
    $canonical = Get-LinkHref $html 'canonical'

    $h1Count = ([regex]::Matches($html, '<h1\b', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)).Count
    $h2Count = ([regex]::Matches($html, '<h2\b', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)).Count
    $jsonLdCount = ([regex]::Matches($html, 'application/ld\+json', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)).Count
    $internalLinkCount = ([regex]::Matches($html, 'href=["'"']/((?!/api).)*?["'"']', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)).Count
    $externalLinkCount = ([regex]::Matches($html, 'href=["'"']https?://', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)).Count
    $govLinkCount = ([regex]::Matches($html, 'https?://[^"'"'\s>]+\.(gov|ca\.gov)', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)).Count
    $hasNoindex = $robots -match 'noindex'

    $results += [pscustomobject]@{
      page = $p.name
      type = $p.type
      url = $p.url
      status = $resp.StatusCode
      title = $title
      titleLength = $title.Length
      descriptionLength = $desc.Length
      hasDescription = -not [string]::IsNullOrWhiteSpace($desc)
      canonical = $canonical
      hasCanonical = -not [string]::IsNullOrWhiteSpace($canonical)
      robots = $robots
      noindex = [bool]$hasNoindex
      h1Count = $h1Count
      h2Count = $h2Count
      jsonLdCount = $jsonLdCount
      internalLinkCount = $internalLinkCount
      externalLinkCount = $externalLinkCount
      govLinkCount = $govLinkCount
    }
  } catch {
    $results += [pscustomobject]@{
      page = $p.name
      type = $p.type
      url = $p.url
      status = 0
      title = ''
      titleLength = 0
      descriptionLength = 0
      hasDescription = $false
      canonical = ''
      hasCanonical = $false
      robots = ''
      noindex = $false
      h1Count = 0
      h2Count = 0
      jsonLdCount = 0
      internalLinkCount = 0
      externalLinkCount = 0
      govLinkCount = 0
    }
  }
}

$out = 'D:\gongsihegui\public\page_snapshots\seo_audit_report.json'
$results | ConvertTo-Json -Depth 4 | Set-Content -Path $out -Encoding UTF8
Write-Host "SEO audit saved to $out"

$results | Select-Object page,type,status,titleLength,descriptionLength,noindex,h1Count,jsonLdCount,govLinkCount | Format-Table -AutoSize